"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TimelineRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // タイムライン機能はダッシュボードのメイン(中央)に統合されたため、ダッシュボードへリダイレクト
    router.push("/dashboard");
  }, [router]);

  return (
    <div className="flex-center" style={{ minHeight: "100vh", flexDirection: "column", gap: "16px" }}>
      <div style={{
        width: "48px",
        height: "48px",
        border: "4px solid rgba(255, 71, 87, 0.2)",
        borderTopColor: "var(--primary)",
        borderRadius: "50%",
        animation: "spin 1s linear infinite"
      }} />
      <p style={{ color: "var(--text-muted)", fontWeight: 600 }}>ダッシュボードへ移動中...</p>
      <style dangerouslySetInnerHTML={{__html: `@keyframes spin { to { transform: rotate(360deg); } }`}} />
    </div>
  );
}
