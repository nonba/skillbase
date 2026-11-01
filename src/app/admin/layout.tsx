import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";

// これが無いと、権限チェック(isSystemAdminのDB参照)を含むこのレイアウトの結果がキャッシュされ、
// 古い判定結果(例: 権限付与前のリダイレクト)がログインし直しても返り続けることがある(2026-09-02発見)。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  manifest: null,
  appleWebApp: {
    capable: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect("/login");
  }

  let user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, isSystemAdmin: true }
  });

  // 自動権限付与（初回アクセス時）
  if (user && user.email === "nonba30@gmail.com" && !user.isSystemAdmin) {
    user = await db.user.update({
      where: { id: user.id },
      data: { isSystemAdmin: true },
      select: { id: true, email: true, isSystemAdmin: true }
    });
  }

  if (!user || !user.isSystemAdmin) {
    redirect("/dashboard"); // 一般ユーザーはアクセス不可
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header style={{ 
        background: "var(--background)", 
        borderBottom: "1px solid var(--border)", 
        padding: "16px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/admin" style={{ fontSize: "20px", fontWeight: 800, textDecoration: "none", color: "var(--text-main)" }}>
            👑 System Admin
          </Link>
          <span className="badge badge-primary">管理者モード</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/admin/inquiries" className="btn" style={{ padding: "8px 16px", fontSize: "14px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-main)", textDecoration: "none" }}>
            ✉️ お問い合わせ管理
          </Link>
          <Link href="/dashboard" className="btn btn-secondary" style={{ padding: "8px 16px", fontSize: "14px" }}>
            アプリに戻る
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, padding: "32px", background: "var(--background)" }}>
        {children}
      </main>
    </div>
  );
}
