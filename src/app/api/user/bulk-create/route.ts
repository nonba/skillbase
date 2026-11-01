import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { ensureTeamCode } from "@/lib/teamCode";

export const dynamic = "force-dynamic";

// 紛らわしい文字（0/O/1/l/I 等）を除いた仮パスワードを生成する
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

// ログインIDのサフィックス（接頭辞を除いた本体）を安全な文字だけに整える
function normalizeSuffix(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

type InputMember = {
  name?: string;
  loginId?: string;
  role?: string; // "PLAYER" | "MANAGER"（選手/指導者）。選手は常に親アカ2つを自動生成
  grade?: number | null; // 学年（0=体験, 1..6）。選手のみ。
  siblingId?: string | null; // 既存の兄弟(選手)。指定時は親を新規作成せず兄弟の保護者を引き継ぐ。
};

// 役割の表記ゆれ（選手/指導者/コーチ/監督/player/manager 等）を正規化する
function normalizeRole(raw: string | undefined): "PLAYER" | "MANAGER" {
  const s = String(raw || "").trim().toLowerCase();
  if (["指導者", "コーチ", "監督", "manager", "coach", "staff", "スタッフ"].includes(s)) return "MANAGER";
  return "PLAYER"; // 既定は選手
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canManageUsers =
      (session.user as any).isOwner ||
      (session.user as any).canManageUsers ||
      session.user.role === "MANAGER";

    if (!canManageUsers || !session.user.teamId) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }

    const body = await req.json();
    const players: InputMember[] = Array.isArray(body?.players) ? body.players : [];

    if (players.length === 0) {
      return NextResponse.json({ error: "登録するメンバーが指定されていません。" }, { status: 400 });
    }
    if (players.length > 100) {
      return NextResponse.json({ error: "一度に登録できるのは100名までです。分割してください。" }, { status: 400 });
    }

    const team = await db.team.findUnique({
      where: { id: session.user.teamId },
      select: { teamCode: true, maxUsers: true },
    });
    if (!team) {
      return NextResponse.json({ error: "所属チームが見つかりません。" }, { status: 404 });
    }
    const teamCode = await ensureTeamCode(session.user.teamId);
    const prefix = `${teamCode.toLowerCase()}_`;

    // --- 入力の検証と正規化（DB書き込み前に全部チェックする） ---
    const seen = new Set<string>();
    const prepared: {
      name: string;
      memberLoginId: string;
      role: "PLAYER" | "MANAGER";
      parentLoginIds: string[];
      grade: number | null;
      siblingId: string | null;
    }[] = [];
    const errors: string[] = [];

    players.forEach((p, idx) => {
      const rowNo = idx + 1;
      const name = String(p.name || "").trim();
      const suffix = normalizeSuffix(p.loginId || "");
      const role = normalizeRole(p.role);
      if (role === "MANAGER" && !((session.user as any).isOwner || session.user.role === "MANAGER")) {
        errors.push(`${rowNo}行目: 指導者として登録できるのはオーナーまたは指導者のみです。`);
        return;
      }
      if (!name) {
        errors.push(`${rowNo}行目: 名前が空です。`);
        return;
      }
      if (!suffix) {
        errors.push(`${rowNo}行目(${name}): ログインIDが空か、使用できない文字だけです（英数字・_・-のみ）。`);
        return;
      }
      const memberLoginId = `${prefix}${suffix}`;
      const siblingId = role === "PLAYER" && p.siblingId ? String(p.siblingId) : null;
      // 選手は保護者アカ2つを自動生成。ただし兄弟(既存選手)を指定した場合は作らず、その兄弟の保護者を引き継ぐ。指導者は本人のみ。
      const wantsParents = role === "PLAYER" && !siblingId;
      const parentLoginIds: string[] = wantsParents ? [`${memberLoginId}-1`, `${memberLoginId}-2`] : [];

      // バッチ内の重複を検出
      [memberLoginId, ...parentLoginIds].forEach((id) => {
        if (seen.has(id)) {
          errors.push(`${rowNo}行目(${name}): ログインID「${id}」がこのリスト内で重複しています。`);
        }
        seen.add(id);
      });

      const grade =
        role === "PLAYER" && p.grade !== undefined && p.grade !== null && p.grade !== ("" as any)
          ? Math.max(0, Math.min(6, Number(p.grade)))
          : null;
      prepared.push({ name, memberLoginId, role, parentLoginIds, grade, siblingId });
    });

    if (errors.length > 0) {
      return NextResponse.json({ error: "入力内容に問題があります。", details: errors }, { status: 400 });
    }

    // --- 既存アカウントとのID重複チェック ---
    const allNewIds = prepared.flatMap((p) => [p.memberLoginId, ...p.parentLoginIds]);
    const existing = await db.user.findMany({
      where: { email: { in: allNewIds } },
      select: { email: true },
    });
    if (existing.length > 0) {
      const taken = existing.map((e) => e.email);
      return NextResponse.json(
        {
          error: "すでに使われているログインIDがあります。",
          details: taken.map((t) => `「${t}」は既に登録済みです。`),
        },
        { status: 400 }
      );
    }

    // --- 課金枠チェック（選手＝課金対象。親は選手1人につき2人まで無料なので加算しない） ---
    const members = await db.user.findMany({
      where: { teamId: session.user.teamId, graduated: false },
      include: { children: { select: { id: true } } },
    });
    const playerToParents = new Map<string, Set<string>>();
    members.forEach((m) => {
      if (m.role === "PARENT") {
        m.children.forEach((c) => {
          if (!playerToParents.has(c.id)) playerToParents.set(c.id, new Set());
          playerToParents.get(c.id)!.add(m.id);
        });
      }
    });
    const freeParents = new Set<string>();
    playerToParents.forEach((set) => Array.from(set).slice(0, 2).forEach((id) => freeParents.add(id)));
    let activeCount = 0;
    members.forEach((m) => {
      if (m.role === "PLAYER" || m.role === "MANAGER") activeCount++;
      else if (m.role === "PARENT" && !freeParents.has(m.id)) activeCount++;
    });

    const newBillable = prepared.length; // 新規の選手＋指導者（親は無料枠なので除外）
    if (activeCount + newBillable > team.maxUsers) {
      return NextResponse.json(
        {
          error: `登録人数の上限（最大 ${team.maxUsers} 人）を超えます。現在 ${activeCount} 人 + 今回 ${newBillable} 人。プランを上げるか人数を減らしてください。`,
        },
        { status: 400 }
      );
    }

    // --- 作成（D1はインタラクティブトランザクション非対応のため順次実行） ---
    const created: {
      id: string;
      name: string;
      loginId: string;
      tempPassword: string;
      role: "PLAYER" | "MANAGER" | "PARENT";
      linkedTo?: string;
    }[] = [];

    for (const p of prepared) {
      const memberTemp = genTempPassword();
      const member = await db.user.create({
        data: {
          name: p.name,
          email: p.memberLoginId,
          password: await bcrypt.hash(memberTemp, 10),
          role: p.role,
          grade: p.grade,
          teamId: session.user.teamId,
          requiresPasswordChange: true,
        },
      });
      created.push({ id: member.id, name: p.name, loginId: p.memberLoginId, tempPassword: memberTemp, role: p.role });

      // 兄弟指定あり: 既存の兄弟(選手)の保護者を引き継いで紐付け（有効化済みを優先し最大2名）。親アカは新規作成しない。
      if (p.siblingId) {
        const sibling = await db.user.findFirst({
          where: { id: p.siblingId, teamId: session.user.teamId, role: "PLAYER" },
          include: { parents: { select: { id: true, requiresPasswordChange: true } } },
        });
        if (sibling && sibling.parents.length > 0) {
          const sorted = [...sibling.parents].sort(
            (a, b) => (a.requiresPasswordChange === false ? 0 : 1) - (b.requiresPasswordChange === false ? 0 : 1)
          );
          const parentIds = sorted.slice(0, 2).map((pp) => ({ id: pp.id }));
          await db.user.update({ where: { id: member.id }, data: { parents: { connect: parentIds } } });
        }
      }

      for (let i = 0; i < p.parentLoginIds.length; i++) {
        const parentLoginId = p.parentLoginIds[i];
        const parentTemp = genTempPassword();
        const parentUser = await db.user.create({
          data: {
            name: `${p.name}の保護者${i + 1}`,
            email: parentLoginId,
            password: await bcrypt.hash(parentTemp, 10),
            role: "PARENT",
            teamId: session.user.teamId,
            requiresPasswordChange: true,
            children: { connect: { id: member.id } },
          },
        });
        created.push({
          id: parentUser.id,
          name: `${p.name}の保護者${i + 1}`,
          loginId: parentLoginId,
          tempPassword: parentTemp,
          role: "PARENT",
          linkedTo: p.name,
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        players: prepared.filter((p) => p.role === "PLAYER").length,
        managers: prepared.filter((p) => p.role === "MANAGER").length,
        parents: created.filter((c) => c.role === "PARENT").length,
        total: created.length,
      },
      accounts: created,
    });
  } catch (error: any) {
    console.error("BULK_CREATE_USER_ERROR", error);
    return NextResponse.json({ error: "一括登録に失敗しました。", details: String(error?.message || error) }, { status: 500 });
  }
}
