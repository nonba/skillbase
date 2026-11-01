import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ObHeader from "./ObHeader";

export const dynamic = "force-dynamic";

// OB(卒団者)専用の限定画面。通常のダッシュボードとは切り離し、
// 「OB向け配信の閲覧」「指導者へのメッセージ」の2点だけを提供する。
export default async function ObLayout({ children }: { children: React.ReactNode }) {
  let session: any = null;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    console.error("[ObLayout] getServerSession catch:", e);
  }

  if (!session?.user) {
    redirect("/login");
  }
  // OBでない一般メンバーは通常のダッシュボードへ
  if (session.user.graduated !== true) {
    redirect("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <ObHeader />
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "0 16px 40px" }}>
        {children}
      </div>
    </div>
  );
}
