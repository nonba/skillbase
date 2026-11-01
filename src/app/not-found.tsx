"use client";

import { useEffect, useState } from "react";

export default function NotFound() {
  const [info, setInfo] = useState({
    url: "",
    referrer: "",
    userAgent: "",
  });

  useEffect(() => {
    setInfo({
      url: window.location.href,
      referrer: document.referrer || "(なし)",
      userAgent: navigator.userAgent,
    });
  }, []);

  return (
    <main style={{ padding: "40px 20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>404</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
        This page could not be found.
      </p>

      {/* 調査用の診断情報（スクリーンショットで共有できるように表示） */}
      <div
        style={{
          background: "rgba(0,0,0,0.04)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "16px",
          fontSize: "12px",
          fontFamily: "monospace",
          wordBreak: "break-all",
          lineHeight: 1.8,
          marginBottom: "24px",
        }}
      >
        <div><strong>失敗したURL:</strong> {info.url || "取得中..."}</div>
        <div><strong>直前のページ:</strong> {info.referrer}</div>
        <div><strong>UserAgent:</strong> {info.userAgent}</div>
      </div>

      <a
        href="/dashboard"
        style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "var(--primary, #ff4757)",
          color: "#fff",
          borderRadius: "8px",
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        ダッシュボードに戻る
      </a>
    </main>
  );
}
