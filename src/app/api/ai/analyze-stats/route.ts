import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { analyzeStatsWithAi, sanitizeAnonymizedStats } from "@/lib/aiStatsAnalysis";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "login" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.aiConsent !== true) {
      return NextResponse.json(
        {
          error: "consent-required",
          message: "AI分析を行うには、外部AIへの匿名数値データ送信への同意が必要です。",
        },
        { status: 403 }
      );
    }

    const sanitized = sanitizeAnonymizedStats(body.stats);
    const anthropicKey = getEnv("ANTHROPIC_API_KEY");
    const result = await analyzeStatsWithAi(sanitized, anthropicKey);

    return NextResponse.json({ ok: true, analysis: result });
  } catch (error) {
    console.error("[AI_ANALYZE_STATS_POST]", error);
    return NextResponse.json({ error: "AI分析の実行に失敗しました。" }, { status: 500 });
  }
}
