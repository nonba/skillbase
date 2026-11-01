import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

// アプリの自動更新・最新ビルド検知用API
export const dynamic = "force-dynamic";

export async function GET() {
  const version =
    getEnv("VERCEL_GIT_COMMIT_SHA") ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.BUILD_ID ||
    "1.0.0";

  return NextResponse.json({
    version,
    timestamp: Date.now(),
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    }
  });
}
