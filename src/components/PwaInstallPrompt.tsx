"use client";

import { useEffect, useState } from "react";

export function PwaInstallPrompt() {
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // サービスワーカーを自動登録してPWAの認識条件を有効化
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("PWA Service Worker registration failed:", err);
      });
    }

    // ユーザーエージェントでiOS判定
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // すでにPWAとして起動しているか判定
    const isStandaloneMode = 
      window.matchMedia("(display-mode: standalone)").matches || 
      ("standalone" in window.navigator && (window.navigator as any).standalone);
    setIsStandalone(isStandaloneMode);

    // iOSかつブラウザからのアクセスの場合、かつ閉じていない場合に表示
    if (isIosDevice && !isStandaloneMode) {
      const hasDismissed = localStorage.getItem("pwa_prompt_dismissed");
      if (!hasDismissed) {
        setShowPrompt(true);
      }
    }

    // Android/PCではネイティブAPK（Google Play配布）に一本化するため、
    // ブラウザのPWAインストールバナーは表示しない。iOS Safariのみ上記で表示する。
    // （beforeinstallprompt はリッスンしない）
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa_prompt_dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "calc(100% - 32px)",
      maxWidth: "400px",
      background: "rgba(15, 23, 42, 0.95)",
      backdropFilter: "blur(20px)",
      border: "1px solid var(--border)",
      borderRadius: "16px",
      padding: "18px",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      animation: "pwaFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "22px" }}>📱</span>
          <div>
            <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#fff" }}>
              SKILLBASE アプリをインストール
            </h4>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "18px", padding: "4px" }}
        >
          ✕
        </button>
      </div>
      
      <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
        ホーム画面に追加すると、Webブラウザのアドレスバーが隠れ、本物のスマホアプリのようにフルスクリーンで快適に起動できます。
      </p>

      {/* iOS向け：Safariの共有メニュー誘導 */}
      <div style={{ fontSize: "12px", color: "#fff", background: "rgba(255, 255, 255, 0.04)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", lineHeight: 1.6 }}>
        1. Safariの「<strong>共有</strong>（<span style={{ fontSize: "14px" }}>⎋</span> または <span style={{ fontSize: "16px" }}>⎙</span>）」ボタンをタップ<br/>
        2. メニューから「<strong>ホーム画面に追加</strong>」を選択
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pwaFadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}} />
    </div>
  );
}
