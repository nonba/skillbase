import { NextResponse } from "next/server";

// オーナー決定(2026-11-20): SKILLBASE が自前のログインで新規ユーザーを作らない形に統一（ログインは BASE アカウントだけ）。
export async function POST() {
  return NextResponse.json(
    { error: "SKILLBASE では独自の新規ユーザー登録を行っていません。BASE アカウントでログインしてください。" },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}
