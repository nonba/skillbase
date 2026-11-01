"use client";

import { useEffect } from "react";

/**
 * デプロイ後に発生する ChunkLoadError やスクリプト404エラーを
 * ブラウザ側で全自動検知し、最新のJSリソースを即時リロードして自動復旧させるコンポーネント。
 */
export function ChunkErrorListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const RELOAD_KEY = "chunk_reload_timestamp";

    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = "reason" in event ? event.reason : event.error;
      const message = error?.message || (event as any)?.message || String(error || "");

      const isChunkError =
        message.includes("ChunkLoadError") ||
        message.includes("Loading chunk") ||
        message.includes("Failed to fetch") ||
        message.includes("Unexpected token '<'") ||
        message.includes("Script error");

      if (isChunkError) {
        console.warn("[ChunkErrorListener] Outdated JS asset error detected. Reloading for auto recovery.");
        
        const lastReload = sessionStorage.getItem(RELOAD_KEY);
        const now = Date.now();

        if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
          sessionStorage.setItem(RELOAD_KEY, now.toString());
          window.location.reload();
        }
      }
    };

    window.addEventListener("error", handleChunkError);
    window.addEventListener("unhandledrejection", handleChunkError);

    return () => {
      window.removeEventListener("error", handleChunkError);
      window.removeEventListener("unhandledrejection", handleChunkError);
    };
  }, []);

  return null;
}
