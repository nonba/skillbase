"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { COLUMN_CATEGORIES, getCategoryMeta, extractYoutubeIds } from "@/lib/columns";
import { gradeLabel } from "@/lib/grade";

export default function ColumnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();

  const { data: detailRes, mutate } = useSWR(`/api/columns/${id}`, fetcher);
  const { data: teamRes } = useSWR(
    session?.user?.teamId ? "/api/team/info" : null,
    fetcher
  );

  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [readLoading, setReadLoading] = useState(false);
  const [showReadPanel, setShowReadPanel] = useState(true);

  // 編集モーダルState
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("BATTING");
  const [editContent, setEditContent] = useState("");
  const [editYoutubeUrl, setEditYoutubeUrl] = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [editAllowComments, setEditAllowComments] = useState(true);
  const [editSaving, setEditSaving] = useState(false);

  const column = detailRes?.column;
  const isCoach = Boolean(detailRes?.isCoach);
  const teamCategory = teamRes?.team?.category || "ELEMENTARY";

  if (!detailRes) {
    return (
      <main className="container" style={{ padding: "40px 20px", maxWidth: "840px", margin: "0 auto" }}>
        <div className="card card-glass" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          読み込み中...
        </div>
      </main>
    );
  }

  if (detailRes.error || !column) {
    return (
      <main className="container" style={{ padding: "40px 20px", maxWidth: "840px", margin: "0 auto" }}>
        <div className="card card-glass" style={{ padding: "40px", textAlign: "center" }}>
          <p style={{ color: "var(--danger)", fontWeight: 700, marginBottom: "16px" }}>
            {detailRes.error || "コラムが見つかりません。"}
          </p>
          <Link href="/dashboard/columns" className="btn btn-secondary">
            ← コラム一覧へ戻る
          </Link>
        </div>
      </main>
    );
  }

  const catMeta = getCategoryMeta(column.category);
  const ytIds = extractYoutubeIds(column.youtubeUrl);
  const images = column.imageUrl ? column.imageUrl.split(",").filter(Boolean) : [];

  const handleToggleRead = async () => {
    setReadLoading(true);
    try {
      await fetch(`/api/columns/${id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggle: true }),
      });
      await mutate();
    } catch (e) {
      console.error(e);
    } finally {
      setReadLoading(false);
    }
  };

  const handleToggleBookmark = async () => {
    try {
      await fetch(`/api/columns/${id}/bookmark`, { method: "POST" });
      await mutate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/columns/${id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "コメント送信に失敗しました");
      }
      setCommentText("");
      await mutate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("このコメントを削除しますか？")) return;
    try {
      await fetch(`/api/columns/${id}/comment?commentId=${commentId}`, {
        method: "DELETE",
      });
      await mutate();
    } catch (e) {
      console.error(e);
    }
  };

  const openEditModal = () => {
    setEditTitle(column.title);
    setEditCategory(column.category);
    setEditContent(column.content || "");
    setEditYoutubeUrl(column.youtubeUrl || "");
    setEditPinned(Boolean(column.isPinned));
    setEditAllowComments(Boolean(column.allowComments));
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      const res = await fetch(`/api/columns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          category: editCategory,
          content: editContent,
          youtubeUrl: editYoutubeUrl,
          isPinned: editPinned,
          allowComments: editAllowComments,
        }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
      setIsEditing(false);
      await mutate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteColumn = async () => {
    if (!confirm("本当にこのコラム・教材を削除しますか？")) return;
    try {
      const res = await fetch(`/api/columns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      router.push("/dashboard/columns");
    } catch (err: any) {
      alert(err.message);
    }
  };

  // シンプルな見出し・段落レンダリング
  const renderFormattedContent = (raw: string) => {
    if (!raw) return null;
    const lines = raw.split(/\r?\n/);
    return lines.map((line, i) => {
      if (line.startsWith("### ")) {
        return (
          <h4
            key={i}
            style={{
              fontSize: "16px",
              fontWeight: 800,
              color: "var(--text-main)",
              marginTop: "20px",
              marginBottom: "8px",
              paddingLeft: "10px",
              borderLeft: `3px solid ${catMeta.color}`,
            }}
          >
            {line.replace(/^###\s+/, "")}
          </h4>
        );
      }
      if (line.startsWith("## ") || line.startsWith("# ")) {
        return (
          <h3
            key={i}
            style={{
              fontSize: "18px",
              fontWeight: 900,
              color: "var(--text-main)",
              marginTop: "24px",
              marginBottom: "10px",
              paddingBottom: "6px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {line.replace(/^#+\s+/, "")}
          </h3>
        );
      }
      if (!line.trim()) {
        return <div key={i} style={{ height: "12px" }} />;
      }
      return (
        <p key={i} style={{ fontSize: "15px", lineHeight: 1.85, color: "var(--text-main)", marginBottom: "6px", whiteSpace: "pre-wrap" }}>
          {line}
        </p>
      );
    });
  };

  return (
    <main className="container animate-fade-in" style={{ padding: "24px 20px", maxWidth: "840px", margin: "0 auto" }}>
      {/* 上部ナビバー */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <Link
          href="/dashboard/columns"
          style={{
            color: "var(--text-muted)",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          ← コラム・教材一覧へ戻る
        </Link>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleToggleBookmark}
            style={{
              background: column.isBookmarked ? "rgba(234, 179, 8, 0.2)" : "var(--surface)",
              border: column.isBookmarked ? "1px solid #eab308" : "1px solid var(--border)",
              color: column.isBookmarked ? "#facc15" : "var(--text-main)",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {column.isBookmarked ? "🔖 ブックマーク済み" : "🔖 ブックマーク保存"}
          </button>

          {isCoach && (
            <>
              <button
                type="button"
                onClick={openEditModal}
                className="btn btn-secondary"
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                ✏️ 編集
              </button>
              <button
                type="button"
                onClick={handleDeleteColumn}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid var(--danger)",
                  color: "#f87171",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🗑️ 削除
              </button>
            </>
          )}
        </div>
      </div>

      {/* メイン記事カード */}
      <article className="card card-glass" style={{ padding: "24px", marginBottom: "24px" }}>
        {/* バッジ列 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
          {column.isPinned && (
            <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "12px", background: "rgba(255, 107, 0, 0.2)", color: "var(--primary)", fontWeight: 800 }}>
              📌 重要
            </span>
          )}
          <span
            style={{
              fontSize: "12px",
              padding: "3px 10px",
              borderRadius: "12px",
              background: `${catMeta.color}22`,
              color: catMeta.color,
              fontWeight: 800,
            }}
          >
            {catMeta.icon} {catMeta.label}
          </span>
          {column.targetType === "ALL" && (
            <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", color: "var(--text-muted)", fontWeight: 700 }}>
              🌐 全学年対象
            </span>
          )}
          {column.targetType === "GRADES" && (
            <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "12px", background: "rgba(59, 130, 246, 0.18)", color: "#60a5fa", fontWeight: 700 }}>
              🎓 対象学年:{" "}
              {(column.targetGrades || "")
                .split(",")
                .filter(Boolean)
                .map((g: string) => gradeLabel(teamCategory, parseInt(g, 10)))
                .join("・")}
            </span>
          )}
          {column.targetType === "GROUPS" && (
            <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "12px", background: "rgba(16, 185, 129, 0.18)", color: "#34d399", fontWeight: 700 }}>
              👥 対象グループ: {(column.targetGroups || []).map((g: any) => g.name).join("・")}
            </span>
          )}
          {column.targetType === "USERS" && (
            <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "12px", background: "rgba(244, 63, 94, 0.2)", color: "#fb7185", fontWeight: 800 }}>
              🎯 個別指導: {(column.targetUsers || []).map((u: any) => `${u.name}選手`).join("・")}
            </span>
          )}
        </div>

        {/* タイトル */}
        <h1 style={{ fontSize: "22px", fontWeight: 900, lineHeight: 1.4, marginBottom: "12px" }}>
          {column.title}
        </h1>

        {/* 投稿者・日時 */}
        <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-muted)", paddingBottom: "16px", marginBottom: "20px", borderBottom: "1px solid var(--border)" }}>
          <span>✍️ 投稿者: {column.author?.name}</span>
          <span>🕒 配信日: {new Date(column.createdAt).toLocaleString("ja-JP")}</span>
        </div>

        {/* YouTube埋め込み動画 */}
        {ytIds.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
            {ytIds.map((vid) => (
              <div
                key={vid}
                style={{
                  position: "relative",
                  paddingBottom: "56.25%",
                  height: 0,
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  background: "#000",
                }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${vid}?rel=0`}
                  title="YouTube video player"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ))}
          </div>
        )}

        {/* 直接アップロードされた指導動画 */}
        {column.videoUrl && (
          <div style={{ marginBottom: "24px" }}>
            <video
              src={column.videoUrl}
              controls
              playsInline
              style={{
                width: "100%",
                maxHeight: "480px",
                borderRadius: "12px",
                background: "#000",
                border: "1px solid var(--border)",
              }}
            />
          </div>
        )}

        {/* アップロード画像ギャラリー */}
        {images.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: images.length === 1 ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            {images.map((imgUrl: string, idx: number) => (
              <a
                key={idx}
                href={imgUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--border)" }}
              >
                <img
                  src={imgUrl}
                  alt={`解説画像 ${idx + 1}`}
                  style={{ width: "100%", maxHeight: "420px", objectFit: "contain", background: "rgba(0,0,0,0.3)", display: "block" }}
                />
              </a>
            ))}
          </div>
        )}

        {/* 添付PDF・資料リンク */}
        {column.fileUrl && (
          <div
            style={{
              marginBottom: "24px",
              padding: "14px 18px",
              borderRadius: "10px",
              background: "rgba(139, 92, 246, 0.1)",
              border: "1px solid rgba(139, 92, 246, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>📄</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "#c4b5fd" }}>
                  添付資料・メニュー表
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-main)" }}>
                  {column.fileName || "添付ファイルを開く"}
                </div>
              </div>
            </div>
            <a
              href={column.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: "12px", padding: "8px 14px", textDecoration: "none" }}
            >
              開く / ダウンロード ↗
            </a>
          </div>
        )}

        {/* 本文 */}
        {column.content && (
          <div style={{ marginBottom: "28px" }}>{renderFormattedContent(column.content)}</div>
        )}

        {/* 「見たよ！（学習完了）」アクションボタン */}
        <div
          style={{
            paddingTop: "20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <button
            type="button"
            onClick={handleToggleRead}
            disabled={readLoading}
            style={{
              width: "100%",
              maxWidth: "380px",
              padding: "14px 24px",
              borderRadius: "30px",
              fontSize: "16px",
              fontWeight: 900,
              cursor: "pointer",
              transition: "all 0.2s ease",
              border: column.isRead ? "2px solid #10b981" : "2px solid var(--primary)",
              background: column.isRead
                ? "rgba(16, 185, 129, 0.2)"
                : "linear-gradient(135deg, #ff6b00 0%, #ff8800 100%)",
              color: column.isRead ? "#34d399" : "#fff",
              boxShadow: column.isRead ? "none" : "0 4px 16px rgba(255, 107, 0, 0.35)",
            }}
          >
            {column.isRead ? "✅ 見たよ！（学習完了済み）" : "👀 見たよ！（学習完了ボタンを押す）"}
          </button>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {column.isRead
              ? "指導者に「見たよ」が伝わっています（もう一度押すと未読に戻せます）"
              : "内容を確認したらボタンを押して監督・コーチに知らせましょう！"}
          </span>
        </div>
      </article>

      {/* 指導者専用：誰が見たか / まだ見ていないか 確認パネル */}
      {isCoach && (
        <section className="card card-glass" style={{ padding: "20px", marginBottom: "24px" }}>
          <div
            onClick={() => setShowReadPanel(!showReadPanel)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
          >
            <h3 style={{ fontSize: "15px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
              📊 指導者用：選手の「見たよ」確認状況
              <span style={{ fontSize: "12px", color: "#34d399", fontWeight: 800 }}>
                （確認済 {column.reads?.length || 0}名 / 未確認 {column.unreadPlayers?.length || 0}名）
              </span>
            </h3>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {showReadPanel ? "▲ 閉じる" : "▼ 開く"}
            </span>
          </div>

          {showReadPanel && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginTop: "16px" }}>
              {/* 既読メンバー */}
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#34d399", marginBottom: "8px" }}>
                  ✅ 見たよ済み ({column.reads?.length || 0}名)
                </div>
                {!column.reads || column.reads.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>まだ誰も押していません</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {column.reads.map((r: any) => {
                      const g = gradeLabel(teamCategory, r.user?.grade);
                      return (
                        <span
                          key={r.userId}
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            borderRadius: "14px",
                            background: "rgba(16, 185, 129, 0.18)",
                            color: "var(--text-main)",
                            fontWeight: 700,
                          }}
                        >
                          {r.user?.jerseyNumber ? `#${r.user.jerseyNumber} ` : ""}
                          {r.user?.name}
                          {g ? ` (${g})` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 未読の対象選手 */}
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#f87171", marginBottom: "8px" }}>
                  ⏳ まだ見ていない対象選手 ({column.unreadPlayers?.length || 0}名)
                </div>
                {!column.unreadPlayers || column.unreadPlayers.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "#34d399", fontWeight: 700 }}>
                    🎉 対象選手全員が確認済みです！
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {column.unreadPlayers.map((u: any) => {
                      const g = gradeLabel(teamCategory, u.grade);
                      return (
                        <span
                          key={u.id}
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            borderRadius: "14px",
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "var(--text-main)",
                            fontWeight: 600,
                          }}
                        >
                          {u.jerseyNumber ? `#${u.jerseyNumber} ` : ""}
                          {u.name}
                          {g ? ` (${g})` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 質問・感想コメント欄 */}
      {column.allowComments && (
        <section className="card card-glass" style={{ padding: "20px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 800, marginBottom: "14px" }}>
            💬 質問・感想コメント ({column.comments?.length || 0})
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
            {!column.comments || column.comments.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                気になった点や質問、学んだことのアウトプットを気軽にコメントしてみましょう！
              </p>
            ) : (
              column.comments.map((c: any) => {
                const canDelete = c.authorId === session?.user?.id || isCoach;
                const gLabel = gradeLabel(teamCategory, c.author?.grade);
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 700 }}>
                        <span>
                          {c.author?.role === "MANAGER" ? "🧢 " : "⚾ "}
                          {c.author?.jerseyNumber ? `#${c.author.jerseyNumber} ` : ""}
                          {c.author?.name}
                          {gLabel ? ` (${gLabel})` : ""}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                          {new Date(c.createdAt).toLocaleString("ja-JP")}
                        </span>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "11px", cursor: "pointer" }}
                        >
                          削除
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{c.content}</p>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleAddComment} style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              className="form-control"
              placeholder="質問や感想を入力..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              disabled={commentSubmitting}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={commentSubmitting || !commentText.trim()}>
              {commentSubmitting ? "送信中..." : "送信"}
            </button>
          </form>
        </section>
      )}

      {/* 編集モーダル */}
      {isEditing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 2500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => !editSaving && setIsEditing(false)}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", padding: "24px", background: "var(--surface)" }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "16px" }}>✏️ コラムを編集</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label">カテゴリー</label>
                <select className="form-control" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                  {COLUMN_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">タイトル</label>
                <input
                  type="text"
                  className="form-control"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">YouTube URL</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={editYoutubeUrl}
                  onChange={(e) => setEditYoutubeUrl(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">本文</label>
                <textarea
                  className="form-control"
                  rows={8}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700 }}>
                  <input type="checkbox" checked={editPinned} onChange={(e) => setEditPinned(e.target.checked)} />
                  📌 上部に固定
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700 }}>
                  <input type="checkbox" checked={editAllowComments} onChange={(e) => setEditAllowComments(e.target.checked)} />
                  💬 コメントを許可
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? "保存中..." : "変更を保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
