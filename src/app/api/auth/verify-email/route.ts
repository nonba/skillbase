import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const base = (getEnv("NEXTAUTH_URL") || process.env.NEXTAUTH_URL || "https://homebase.easystance.app").replace(/\/$/, "");

  if (!token) {
    return NextResponse.redirect(`${base}/login?verify_error=1`);
  }

  const user = await db.user.findFirst({ where: { emailVerificationToken: token } });
  if (!user) {
    return NextResponse.redirect(`${base}/login?verify_error=1`);
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerificationToken: null },
  });

  return NextResponse.redirect(`${base}/login?verified=1`);
}
