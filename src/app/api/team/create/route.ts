import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStandardStorageBytes } from "@/lib/billing";

function generateInviteCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { name, description, couponCode, category, startFull } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "チーム名は必須です。" }, { status: 400 });
    }

    const teamCategory = ["ELEMENTARY", "JUNIOR_HIGH", "HIGH_SCHOOL"].includes(category)
      ? category
      : "ELEMENTARY";

    const currentUser = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isOwner: true, role: true, teamId: true }
    });

    // 既にチームに所属している場合は、管理者/オーナーのみチーム作成を許可
    if (currentUser?.teamId) {
      if (!currentUser?.isOwner && currentUser?.role !== "MANAGER") {
        return NextResponse.json({ error: "チームを作成する権限がありません。" }, { status: 403 });
      }
    }

    // クーポンコード検証（入力があれば）。無効なら作成せずエラーを返す。
    let validCoupon: { id: string } | null = null;
    if (couponCode && String(couponCode).trim()) {
      const code = String(couponCode).trim().toUpperCase();
      const coupon = await db.coupon.findUnique({ where: { code } });
      if (!coupon || !coupon.active) {
        return NextResponse.json({ error: "クーポンコードが無効です。" }, { status: 400 });
      }
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return NextResponse.json({ error: "クーポンの有効期限が切れています。" }, { status: 400 });
      }
      if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
        return NextResponse.json({ error: "このクーポンは使用上限に達しています。" }, { status: 400 });
      }
      validCoupon = { id: coupon.id };
    }

    let inviteCode = "";
    let codeExists = true;
    while (codeExists) {
      inviteCode = generateInviteCode();
      const existingTeam = await db.team.findUnique({
        where: { inviteCode },
      });
      if (!existingTeam) {
        codeExists = false;
      }
    }

    // 連番のチームコード（ST001, ST002...）を算出
    const lastTeam = await db.team.findFirst({
      where: { teamCode: { startsWith: "ST" } },
      orderBy: { teamCode: "desc" },
      select: { teamCode: true }
    });

    let nextIndex = 1;
    if (lastTeam && lastTeam.teamCode) {
      const match = lastTeam.teamCode.match(/^ST(\d+)$/);
      if (match) {
        nextIndex = parseInt(match[1], 10) + 1;
      }
    }

    let teamCode = "";
    let isUnique = false;
    while (!isUnique) {
      teamCode = `ST${String(nextIndex).padStart(3, "0")}`;
      const existing = await db.team.findUnique({
        where: { teamCode },
      });
      if (!existing) {
        isUnique = true;
      } else {
        nextIndex++;
      }
    }

    // Cloudflare D1 はインタラクティブトランザクション非対応のため、tx=db で順次実行する。
    const team = await (async () => {
      const tx = db;
      const newTeam = await tx.team.create({
        data: {
          name,
          description,
          category: teamCategory,
          inviteCode,
          teamCode, // チームコードを保存
          maxStorageBytes: getStandardStorageBytes(30), // maxUsersはスキーマ既定の30人 → 標準5GBを初期付与
          // 作成画面で「HOMEBASE(有料版)を使う」/「HOMEBASE Attach(無料)だけ使う」を明示選択してもらう
          // (2026-09-03追加)。有料版を選んだ場合はここでFULL+トライアル開始日を直接セットし、
          // 「HOMEBASEを試す」を後で別途押す手間を省く。無料版を選んだ場合は従来通りFREE_ENTRYからスタート。
          tier: startFull ? "FULL" : "FREE_ENTRY",
          ...(startFull ? { homebaseTrialStartedAt: new Date() } : {}),
          ...(validCoupon ? { couponId: validCoupon.id, couponAppliedAt: new Date() } : {}),
        },
      });

      // チーム作成したユーザーをそのチームのオーナーかつ管理者に自動設定
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          teamId: newTeam.id,
          isOwner: true,
          role: "MANAGER"
        },
      });

      // クーポン使用回数を加算
      if (validCoupon) {
        await tx.coupon.update({
          where: { id: validCoupon.id },
          data: { timesRedeemed: { increment: 1 } },
        });
      }

      return newTeam;
    })();

    return NextResponse.json({
      message: "チームを作成しました。",
      team,
    });
  } catch (error: any) {
    console.error("Team create error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
