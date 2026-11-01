export type ColumnCategory =
  | "BATTING"
  | "PITCHING"
  | "FIELDING"
  | "RUNNING"
  | "TRAINING"
  | "MENTAL"
  | "NUTRITION"
  | "TACTICS"
  | "OTHER";

export interface CategoryMeta {
  value: ColumnCategory;
  label: string;
  icon: string;
  color: string;
}

export const COLUMN_CATEGORIES: CategoryMeta[] = [
  { value: "BATTING", label: "打撃", icon: "⚾", color: "#f97316" },
  { value: "PITCHING", label: "投球", icon: "🔥", color: "#ef4444" },
  { value: "FIELDING", label: "守備", icon: "🧤", color: "#3b82f6" },
  { value: "RUNNING", label: "走塁", icon: "⚡", color: "#eab308" },
  { value: "TRAINING", label: "トレーニング", icon: "💪", color: "#10b981" },
  { value: "MENTAL", label: "メンタル", icon: "🧠", color: "#8b5cf6" },
  { value: "NUTRITION", label: "食育・栄養", icon: "🍙", color: "#ec4899" },
  { value: "TACTICS", label: "戦術・座学", icon: "📋", color: "#06b6d4" },
  { value: "OTHER", label: "その他", icon: "📌", color: "#64748b" },
];

export function getCategoryMeta(category?: string | null): CategoryMeta {
  return (
    COLUMN_CATEGORIES.find((c) => c.value === category) ||
    COLUMN_CATEGORIES[COLUMN_CATEGORIES.length - 1]
  );
}

/**
 * YouTubeのURL文字列（改行やカンマで複数指定可）からVideo IDの配列を抽出する。
 * 通常動画 (watch?v=...), 短縮URL (youtu.be/...), ショート動画 (shorts/...), 埋め込みURL (embed/...) すべてに対応。
 */
export function extractYoutubeIds(raw?: string | null): string[] {
  if (!raw) return [];
  const tokens = raw
    .split(/[\s,、\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const ids: string[] = [];
  for (const token of tokens) {
    let videoId: string | null = null;
    try {
      if (/^[a-zA-Z0-9_-]{11}$/.test(token)) {
        videoId = token;
      } else {
        const url = new URL(token);
        if (url.hostname.includes("youtu.be")) {
          videoId = url.pathname.split("/").filter(Boolean)[0] || null;
        } else if (url.hostname.includes("youtube.com")) {
          if (url.searchParams.get("v")) {
            videoId = url.searchParams.get("v");
          } else {
            const parts = url.pathname.split("/").filter(Boolean);
            const idx = parts.findIndex((p) => p === "shorts" || p === "embed" || p === "live" || p === "v");
            if (idx !== -1 && parts[idx + 1]) {
              videoId = parts[idx + 1];
            }
          }
        }
      }
    } catch {
      // Fallback regex
      const m = token.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
      if (m) videoId = m[1];
    }

    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) && !ids.includes(videoId)) {
      ids.push(videoId);
    }
  }
  return ids;
}
