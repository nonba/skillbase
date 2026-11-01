"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

export interface ViewerMedia {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  isVideo?: boolean;
  authorName?: string | null;
  createdAt?: string | null;
  caption?: string | null;
}

interface MediaViewerProps {
  items: ViewerMedia[];
  startIndex: number;
  onClose: () => void;
  // ヘッダー右側に追加ボタン（削除など）を差し込みたい場合に使用
  renderActions?: (item: ViewerMedia) => React.ReactNode;
}

// 写真・動画の全画面ビューア（スワイプ/矢印/キーボードで前後移動、ダウンロード対応）
export default function MediaViewer({ items, startIndex, onClose, renderActions }: MediaViewerProps) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), items.length - 1));
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const item = items[index];

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(items.length - 1, i + 1)), [items.length]);

  // キーボード操作（PC向け）＋ 背面スクロールロック
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [goPrev, goNext, onClose]);

  // スワイプ操作（スマホ向け）
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // 横方向のスワイプのみ反応（縦スクロールやタップと区別）
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  // ダウンロード: /api/download 経由で「保存」ヘッダ付きで返す（ブラウザ/アプリ共通）
  const handleDownload = () => {
    if (!item?.url) return;
    try {
      const pathname = new URL(item.url).pathname;
      const fileName = pathname.split("/").pop() || `homebase_${Date.now()}`;
      const dlUrl = `/api/download?u=${encodeURIComponent(item.url)}&name=${encodeURIComponent(fileName)}`;
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  if (typeof document === "undefined" || !item) return null;

  const formatDateTime = (s?: string | null) => {
    if (!s) return "";
    return new Date(s).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return createPortal(
    <div
      style={{
        position: "fixed", top: 0, left: 0, width: "100vw", height: "100dvh",
        backgroundColor: "rgba(0, 0, 0, 0.96)", zIndex: 10000,
        display: "flex", flexDirection: "column",
        touchAction: "pan-y", overscrollBehavior: "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ヘッダー */}
      <div style={{ position: "absolute", top: "20px", left: "20px", right: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, gap: "10px" }}>
        <div style={{ color: "#fff", fontSize: "14px", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.authorName || ""}
          {item.createdAt && (
            <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.6)", marginLeft: "10px", fontSize: "12px" }}>
              {formatDateTime(item.createdAt)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {renderActions && renderActions(item)}
          <button
            onClick={handleDownload}
            title="ダウンロード"
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", cursor: "pointer" }}
          >✕</button>
        </div>
      </div>

      {/* メディア表示 */}
      <div
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 12px 60px", minHeight: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {item.isVideo ? (
          <video
            key={item.id}
            src={item.url}
            poster={item.thumbnailUrl || undefined}
            controls
            autoPlay
            playsInline
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={item.url} alt="メディア" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        )}
      </div>

      {/* 前へ / 次へ（PC向けの矢印。スマホはスワイプ） */}
      {index > 0 && (
        <button
          onClick={goPrev}
          style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", width: "40px", height: "40px", borderRadius: "50%", fontSize: "20px", cursor: "pointer", zIndex: 10 }}
        >‹</button>
      )}
      {index < items.length - 1 && (
        <button
          onClick={goNext}
          style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", width: "40px", height: "40px", borderRadius: "50%", fontSize: "20px", cursor: "pointer", zIndex: 10 }}
        >›</button>
      )}

      {/* フッター: キャプション＋枚数カウンター */}
      <div style={{ position: "absolute", bottom: "20px", left: 0, width: "100%", textAlign: "center", pointerEvents: "none", padding: "0 20px" }}>
        {item.caption && (
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "13px", margin: "0 0 6px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.caption}</p>
        )}
        {items.length > 1 && (
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", fontWeight: 700 }}>{index + 1} / {items.length}</span>
        )}
      </div>
    </div>,
    document.body
  );
}
