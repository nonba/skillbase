import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// statsの計算ヘルパー
function calculateStats(batterStats: any[], pitcherStats: any[]) {
  // 打撃
  let atBats = 0;
  let hits = 0;
  let homeRuns = 0;
  let runsBattedIn = 0;
  let runs = 0;
  let strikeoutsBatting = 0;
  let walks = 0;

  batterStats.forEach((stat) => {
    atBats += stat.atBats;
    hits += stat.hits;
    homeRuns += stat.homeRuns;
    runsBattedIn += stat.runsBattedIn;
    runs += stat.runs;
    strikeoutsBatting += stat.strikeouts;
    walks += stat.walks;
  });

  const avg = atBats > 0 ? (hits / atBats).toFixed(3) : "0.000";

  // 投球
  let totalOuts = 0;
  let hitsAllowed = 0;
  let runsAllowed = 0;
  let earnedRuns = 0;
  let strikeoutsPitching = 0;
  let walksAllowed = 0;
  let wins = 0;
  let losses = 0;
  let saves = 0;

  pitcherStats.forEach((stat) => {
    const ip = stat.inningsPitched;
    const whole = Math.floor(ip);
    const fraction = Math.round((ip - whole) * 10);
    const outs = whole * 3 + (fraction === 1 ? 1 : fraction === 2 ? 2 : 0);
    totalOuts += outs;

    hitsAllowed += stat.hitsAllowed;
    runsAllowed += stat.runsAllowed;
    earnedRuns += stat.earnedRuns;
    strikeoutsPitching += stat.strikeouts;
    walksAllowed += stat.walksAllowed;
    wins += stat.wins;
    losses += stat.losses;
    saves += stat.saves;
  });

  const inningsPitched = (Math.floor(totalOuts / 3) + (totalOuts % 3 === 1 ? 0.1 : totalOuts % 3 === 2 ? 0.2 : 0.0)).toFixed(1);
  const ipValue = totalOuts / 3;
  const era = ipValue > 0 ? ((earnedRuns * 9) / ipValue).toFixed(2) : "0.00";

  return {
    batting: { avg, atBats, hits, homeRuns, runsBattedIn, runs, strikeouts: strikeoutsBatting, walks },
    pitching: { era, inningsPitched, hitsAllowed, runsAllowed, earnedRuns, strikeouts: strikeoutsPitching, walksAllowed, wins, losses, saves }
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const team = await db.team.findUnique({
      where: { id: session.user.teamId! },
      select: { scorePlan: true }
    });

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: {
        batterStats: true,
        pitcherStats: true,
        children: {
          include: {
            batterStats: true,
            pitcherStats: true,
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません。" }, { status: 404 });
    }

    // 自分の成績
    const myStats = calculateStats(user.batterStats, user.pitcherStats);

    // 子供の成績
    const childrenWithStats = user.children.map(child => ({
      id: child.id,
      name: child.name,
      jerseyNumber: child.jerseyNumber,
      stats: calculateStats(child.batterStats, child.pitcherStats)
    }));

    return NextResponse.json({
      scorePlan: team?.scorePlan || "NONE",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        jerseyNumber: user.jerseyNumber,
        parentRelation: user.parentRelation,
        stats: myStats,
        children: childrenWithStats,
      }
    });

  } catch (error: any) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const { action, childId, relation, name } = await req.json();

    if (!action) {
      return NextResponse.json({ error: "必要なパラメータがありません。" }, { status: 400 });
    }

    if (action === "update_name") {
      const trimmed = String(name || "").trim();
      if (!trimmed) {
        return NextResponse.json({ error: "名前を入力してください。" }, { status: 400 });
      }
      await db.user.update({
        where: { id: session.user.id },
        data: { name: trimmed },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "update_relation") {
      const VALID_RELATIONS = ["FATHER", "MOTHER", "OTHER"];
      if (!VALID_RELATIONS.includes(relation)) {
        return NextResponse.json({ error: "不正な続柄です。" }, { status: 400 });
      }
      await db.user.update({
        where: { id: session.user.id },
        data: { parentRelation: relation },
      });
      return NextResponse.json({ success: true });
    }

    if (!childId) {
      return NextResponse.json({ error: "必要なパラメータがありません。" }, { status: 400 });
    }

    if (action === "link_child") {
      // 紐付け先の選手が既に「実在（有効化済み）の保護者2名」に達していないか確認。
      // 未ログインの仮アカは数に入れない（掃除で片付くため）。
      const child = await db.user.findUnique({
        where: { id: childId },
        select: {
          name: true,
          parents: { select: { id: true, requiresPasswordChange: true } },
        },
      });
      if (!child) {
        return NextResponse.json({ error: "対象の選手が見つかりません。" }, { status: 404 });
      }
      const alreadyLinked = child.parents.some((p) => p.id === session.user.id);
      const activatedParents = child.parents.filter((p) => p.requiresPasswordChange === false).length;
      if (!alreadyLinked && activatedParents >= 2) {
        return NextResponse.json(
          { error: `「${child.name}」さんには既に保護者が2名います。監督に相談してどちらかを外してもらってください。` },
          { status: 400 }
        );
      }
      await db.user.update({
        where: { id: session.user.id },
        data: {
          children: {
            connect: { id: childId }
          }
        }
      });
    } else if (action === "unlink_child") {
      await db.user.update({
        where: { id: session.user.id },
        data: {
          children: {
            disconnect: { id: childId }
          }
        }
      });
    } else {
      return NextResponse.json({ error: "不正なアクションです。" }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました。" }, { status: 500 });
  }
}
