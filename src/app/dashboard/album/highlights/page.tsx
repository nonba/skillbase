"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Link from "next/link";
import MediaViewer from "@/components/MediaViewer";

export default function HighlightsHistoryPage() {
  const { status } = useSession();
  const router = useRouter();

  const { data } = useSWR(`/api/album/highlights`, fetcher);

  // その日のハイライト一覧をスワイプで通し見できるよう、日付グループ＋位置で保持する
  const [viewer, setViewer] = useState<{ items: any[]; index: number } | null>(null);

  if (status === "unauthenticated") router.push("/login");

  if (!data) return <div style={{ padding: "40px", textAlign: "center" }}>読み込み中...</div>;

  // 日付ごとのグループ化
  const groupedHighlights = data.highlights?.reduce((acc: any, highlight: any) => {
    const dateStr = new Date(highlight.createdAt).toLocaleDateString('ja-JP');
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(highlight);
    return acc;
  }, {}) || {};

  const sortedDates = Object.keys(groupedHighlights).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="container" style={{ padding: "40px 20px" }}>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "flex-start" }}>
        <Link href="/dashboard?tab=album" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "14px" }}>
          ← アルバムに戻る
        </Link>
      </div>

      <div className="card card-glass">
        <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px", color: "var(--accent)" }}>🔴 ハイライト履歴</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "32px" }}>過去に投稿された直上げ動画の一覧です。（24時間経過してタイムラインから消えたものもここから見られます）</p>

        {sortedDates.length > 0 ? sortedDates.map((date: string, index: number) => (
          <details key={date} style={{ marginBottom: "24px", background: "var(--surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflow: "hidden" }} open={index === 0}>
            <summary style={{ padding: "20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "18px", fontWeight: 800, outline: "none", userSelect: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "24px" }}>📁</span> 
                <span>{date}</span>
                <span style={{ fontSize: "14px", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "8px" }}>
                  ({groupedHighlights[date].length}件)
                </span>
              </div>
            </summary>
            
            <div style={{ padding: "0 20px 20px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "16px" }}>
              {groupedHighlights[date].map((highlight: any, idx: number) => (
                <div
                  key={highlight.id}
                  onClick={() => setViewer({ items: groupedHighlights[date], index: idx })}
                  style={{ 
                    aspectRatio: "9 / 16", 
                    borderRadius: "var(--radius-sm)", 
                    overflow: "hidden", 
                    background: "#000", 
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    position: "relative",
                    transition: "transform 0.2s"
                  }}
                  onMouseOver={e => e.currentTarget.style.transform = "scale(1.03)"}
                  onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                >
                  {highlight.isVideo && highlight.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={highlight.thumbnailUrl}
                      alt="ハイライト"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : highlight.isVideo && highlight.imageUrl ? (
                    <video
                      src={`${highlight.imageUrl}#t=0.1`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      preload="metadata"
                      muted
                      playsInline
                    />
                  ) : highlight.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={highlight.imageUrl} 
                      alt="ハイライト" 
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : null}
                  <div style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: "100%",
                    background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
                    padding: "20px 8px 8px",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span>{highlight.author?.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )) : (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
            まだハイライトがありません。
          </p>
        )}
      </div>

      {/* Viewer モーダル（共通MediaViewer: 同じ日のハイライトをスワイプで通し見＋ダウンロード） */}
      {viewer && (
        <MediaViewer
          items={viewer.items.map((h: any) => ({
            id: h.id,
            url: h.imageUrl || "",
            thumbnailUrl: h.thumbnailUrl || null,
            isVideo: h.isVideo,
            authorName: h.author?.name,
            createdAt: h.createdAt,
          }))}
          startIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
