"use client";

import React, { useState } from "react";
import MediaViewer from "./MediaViewer";

interface Author {
  id: string;
  name: string;
}

interface HighlightPost {
  id: string;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
  isVideo?: boolean;
  author: Author;
  createdAt: string;
}

interface HighlightCarouselProps {
  highlights: HighlightPost[];
  currentUserId: string;
  isPostAdmin: boolean;
  onDeleteHighlight: (id: string) => void;
}

const sanitizeUrl = (url: string | null): string => {
  if (!url) return "";
  if (url.startsWith("https://https://")) {
    return url.replace("https://https://", "https://");
  }
  return url;
};

export default function HighlightCarousel({ highlights, currentUserId, isPostAdmin, onDeleteHighlight }: HighlightCarouselProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!highlights || highlights.length === 0) {
    return null;
  }

  const closeViewer = () => setSelectedIndex(null);
 
  return (
    <div style={{ marginBottom: "24px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 800, color: "var(--accent)", letterSpacing: "1px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
        🔴 本日のハイライト
      </h3>
      
      {/* カルーセル (横スクロールエリア) */}
      <div style={{ 
        display: "flex", 
        gap: "16px", 
        overflowX: "auto", 
        paddingBottom: "8px",
        msOverflowStyle: "none", // IE and Edge
        scrollbarWidth: "none" // Firefox
      }}>
        {highlights.map((post, idx) => (
          <div
            key={post.id}
            onClick={() => setSelectedIndex(idx)}
            style={{ 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              gap: "6px",
              cursor: "pointer",
              flexShrink: 0
            }}
          >
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "var(--surface)",
              border: "3px solid var(--accent)",
              padding: "2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden"
            }}>
              {post.isVideo && post.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sanitizeUrl(post.thumbnailUrl)}
                  alt="ハイライト"
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                />
              ) : post.isVideo && post.imageUrl ? (
                <video
                  src={`${sanitizeUrl(post.imageUrl)}#t=0.1`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                  preload="metadata"
                  muted
                  playsInline
                />
              ) : post.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={sanitizeUrl(post.imageUrl)} 
                  alt="ハイライト" 
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                />
              ) : (
                <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--text-muted)" }}>
                  {post.author?.name?.charAt(0) || "?"}
                </div>
              )}
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-main)", maxWidth: "64px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {post.author?.name || "不明"}
            </span>
          </div>
        ))}
        
        {/* CSS for hiding scrollbar in webkit browsers */}
        <style dangerouslySetInnerHTML={{__html: `
          div::-webkit-scrollbar {
            display: none;
          }
        `}} />
      </div>

      {/* Viewer モーダル（共通MediaViewer: スワイプで前後のハイライトへ移動＋ダウンロード） */}
      {selectedIndex !== null && (
        <MediaViewer
          items={highlights.map((post) => ({
            id: post.id,
            url: sanitizeUrl(post.imageUrl),
            thumbnailUrl: post.thumbnailUrl ? sanitizeUrl(post.thumbnailUrl) : null,
            isVideo: post.isVideo,
            authorName: post.author?.name,
            createdAt: post.createdAt,
          }))}
          startIndex={selectedIndex}
          onClose={closeViewer}
          renderActions={(item) => {
            const post = highlights.find((h) => h.id === item.id);
            if (!post || (post.author?.id !== currentUserId && !isPostAdmin)) return null;
            return (
              <button
                onClick={() => {
                  onDeleteHighlight(post.id);
                  closeViewer();
                }}
                style={{
                  background: "rgba(255, 71, 87, 0.8)", color: "#fff", border: "none",
                  width: "36px", height: "36px", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer"
                }}
                title="削除"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            );
          }}
        />
      )}
    </div>
  );
}
