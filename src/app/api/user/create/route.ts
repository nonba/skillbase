import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { ensureTeamCode } from "@/lib/teamCode";

// 紛らわしい文字（0/O/1/l/I 等）を除いた仮パスワードを生成
const TEMP_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
function genTempPassword(len = 8): string {
  let out = "";
  const arr = new Uint32Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += TEMP_CHARS[arr[i] % TEMP_CHARS.length];
  } else {
    for (let i = 0; i < len; i++) out += TEMP_CHARS[Math.floor(Math.random() * TEMP_CHARS.length)];
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 権限チェック (isOwner または canManageUsers が必要)
    const canManageUsers = 
      (session.user as any).isOwner || 
      (session.user as any).canManageUsers || 
      session.user.role === "MANAGER";
      
    if (!canManageUsers || !session.user.teamId) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }
    // MANAGER(指導者)アカウントを作れるのは、オーナーまたは指導者本人のみ（権限フラグの委任だけでは昇格不可）
    const canCreateManager = !!((session.user as any).isOwner || session.user.role === "MANAGER");

    const body = await req.json();
    const { name, loginId, password, siblingId, position } = body;
    // role は PLAYER / PARENT / MANAGER のみ受け付ける（未指定・不正値は選手として扱う）
    const role: "PLAYER" | "PARENT" | "MANAGER" = ["PARENT", "MANAGER"].includes(body.role) ? body.role : "PLAYER";
    if (role === "MANAGER" && !canCreateManager) {
      return NextResponse.json({ error: "指導者アカウントを作成できるのはオーナーまたは指導者のみです。" }, { status: 403 });
    }

    if (!name || !loginId || !password) {
      return NextResponse.json({ error: "必須項目が入力されていません。" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "パスワードは6文字以上で設定してください。" }, { status: 400 });
    }

    // 所属チームの情報を取得
    const team = await db.team.findUnique({
      where: { id: session.user.teamId },
      select: { teamCode: true, maxUsers: true }
    });

    if (!team) {
      return NextResponse.json({ error: "所属チームが見つかりません。" }, { status: 404 });
    }
    const teamCode = await ensureTeamCode(session.user.teamId);

    // 現在の所属メンバー全員を取得し、アクティブ課金枠人数を計算する
    const members = await db.user.findMany({
      where: { teamId: session.user.teamId, graduated: false },
      include: {
        children: { select: { id: true } }
      }
    });

    // 選手ごとの親マップを構築
    const playerToParentsMap = new Map<string, Set<string>>();
    members.forEach(member => {
      if (member.role === "PARENT") {
        member.children.forEach(child => {
          if (!playerToParentsMap.has(child.id)) {
            playerToParentsMap.set(child.id, new Set());
          }
          playerToParentsMap.get(child.id)!.add(member.id);
        });
      }
    });

    // 無料枠（選手1人あたり親2人まで）に該当する親のIDセット
    const freeParents = new Set<string>();
    playerToParentsMap.forEach((parentIds) => {
      const parentArray = Array.from(parentIds);
      parentArray.slice(0, 2).forEach(parentId => {
        freeParents.add(parentId);
      });
    });

    // 現在のアクティブ対象者数を算出
    let activeMemberCount = 0;
    members.forEach(member => {
      if (member.role === "PLAYER" || member.role === "MANAGER") {
        activeMemberCount++;
      } else if (member.role === "PARENT") {
        if (!freeParents.has(member.id)) {
          activeMemberCount++;
        }
      }
    });

    // 新規作成ユーザーが課金対象（無料枠に入らない新規登録）かつ、すでに制限を超えている場合
    // 新規登録時点では子どもと紐付いていないため、PARENTも一旦+1カウントとして計算されます
    if (activeMemberCount + 1 > team.maxUsers) {
      return NextResponse.json({
        error: `チームの登録人数上限（最大 ${team.maxUsers} 人）に達しているため、これ以上メンバーを作成できません。`
      }, { status: 400 });
    }

    // ログインIDにチームコードのプレフィックスを自動付与 (例: st001_yamada)
    const prefix = `${teamCode.toLowerCase()}_`;
    const normalizedInput = loginId.trim().toLowerCase();
    const finalLoginId = normalizedInput.startsWith(prefix)
      ? normalizedInput
      : `${prefix}${normalizedInput}`;

    // loginId (DB上はemailフィールド) の重複チェック
    const existingUser = await db.user.findUnique({
      where: { email: finalLoginId }
    });

    if (existingUser) {
      return NextResponse.json({ error: "このログインIDはすでに使用されています。別のIDを指定してください。" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await db.user.create({
      data: {
        name,
        email: finalLoginId, // チームコード接頭辞付きのIDをemailとして保存
        password: hashedPassword,
        role: role || "PLAYER",
        position: position || (role === "MANAGER" ? "コーチ" : undefined),
        teamId: session.user.teamId,
      }
    });

    const isPlayer = (role || "PLAYER") === "PLAYER";

    // 兄弟登録: 既存の兄弟(選手)の保護者を、この新しい子にも引き継いで紐付ける（親アカは増やさない）。
    // 有効化済み(初ログイン済み)の親を優先して最大2名。
    let linkedSiblingParents = 0;
    if (siblingId && isPlayer) {
      const sibling = await db.user.findFirst({
        where: { id: siblingId, teamId: session.user.teamId, role: "PLAYER" },
        include: { parents: { select: { id: true, requiresPasswordChange: true } } },
      });
      if (sibling && sibling.parents.length > 0) {
        const sorted = [...sibling.parents].sort(
          (a, b) => (a.requiresPasswordChange === false ? 0 : 1) - (b.requiresPasswordChange === false ? 0 : 1)
        );
        const parentIds = sorted.slice(0, 2).map((p) => ({ id: p.id }));
        await db.user.update({ where: { id: user.id }, data: { parents: { connect: parentIds } } });
        linkedSiblingParents = parentIds.length;
      }
    }

    // 選手は「常に」保護者アカ2つを自動生成（＝基本コンセプト）。兄弟から引き継いだ場合は作らない。
    const createdParents: { loginId: string; name: string; tempPassword: string }[] = [];
    if (isPlayer && linkedSiblingParents === 0) {
      for (const [idx, suffix] of [["1", "-1"], ["2", "-2"]] as const) {
        const parentLoginId = `${finalLoginId}${suffix}`;
        const dup = await db.user.findUnique({ where: { email: parentLoginId } });
        if (dup) continue; // 稀な衝突はスキップ
        const temp = genTempPassword();
        const parent = await db.user.create({
          data: {
            name: `${name}の保護者${idx}`,
            email: parentLoginId,
            password: await bcrypt.hash(temp, 10),
            role: "PARENT",
            requiresPasswordChange: true,
            teamId: session.user.teamId,
            children: { connect: { id: user.id } },
          },
        });
        createdParents.push({ loginId: parentLoginId, name: parent.name, tempPassword: temp });
      }
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name },
      linkedSiblingParents,
      parents: createdParents,
    });
  } catch (error: any) {
    console.error("CREATE_USER_ERROR", error);
    return NextResponse.json({ error: "メンバーの作成に失敗しました。" }, { status: 500 });
  }
}
