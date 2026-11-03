"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import imageCompression from "browser-image-compression";
import { fetcher } from "@/lib/fetcher";
import { COLUMN_CATEGORIES, getCategoryMeta, extractYoutubeIds } from "@/lib/columns";
import { gradeLabel, gradeOptions } from "@/lib/grade";

export default function ColumnsListPage() {
  const { data: session } = useSession();
  const { data: columnsRes, mutate } = useSWR(
    session?.user?.teamId ? "/api/columns" : null,
    fetcher
  );
  const { data: teamRes } = useSWR(
    session?.user?.teamId ? "/api/team/info" : null,
    fetcher
  );
  const { data: groupsRes } = useSWR(
    session?.user?.teamId ? "/api/group" : null,
    fetcher
  );

  // フィルタState
  const [viewMode, setViewMode] = useState<"ALL" | "UNREAD" | "BOOKMARKED" | "PERSONAL">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // 新規作成モーダルState
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("BATTING");
  const [content, setContent] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [targetType, setTargetType] = useState<"ALL" | "GRADES" | "GROUPS" | "USERS">("ALL");
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [allowComments, setAllowComments] = useState(true);

  // メディア・ファイル添付State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [formError, setFormError] = useState("");

  const columns = columnsRes?.columns || [];
  const isCoach = Boolean(columnsRes?.isCoach);
  const teamCategory = teamRes?.team?.category || "JUNIOR_HIGH";
  const members = (teamRes?.team?.members || []).filter((m: any) => m.role === "PLAYER" && !m.graduated);
  const groups = (groupsRes?.groups || []).filter((g: any) => !g.isArchived);
  const gradeOpts = gradeOptions(teamCategory);

  const uploadToR2 = async (file: File): Promise<string> => {
    const WORKER_LIMIT = 90 * 1024 * 1024;
    if (file.size <= WORKER_LIMIT) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/r2", { method: "POST", body: fd });
      if (!res.ok) throw new Error("ファイルのアップロードに失敗しました");
      const data = await res.json();
      return data.publicUrl as string;
    } else {
      const res = await fetch("/api/upload/r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!res.ok) throw new Error("署名URLの取得に失敗しました");
      const r2Data = await res.json();
      const putRes = await fetch(r2Data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("動画のR2アップロードに失敗しました");
      return r2Data.publicUrl as string;
    }
  };

  const handleToggleBookmark = async (e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/columns/${columnId}/bookmark`, { method: "POST" });
      await mutate();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!title.trim()) {
      setFormError("タイトルを入力してください。");
      return;
    }
    if (targetType === "GRADES" && selectedGrades.length === 0) {
      setFormError("配信対象の学年を1つ以上選択してください。");
      return;
    }
    if (targetType === "GROUPS" && selectedGroupIds.length === 0) {
      setFormError("配信対象のグループを1つ以上選択してください。");
      return;
    }
    if (targetType === "USERS" && selectedUserIds.length === 0) {
      setFormError("配信対象の選手を1人以上選択してください。");
      return;
    }

    setSubmitting(true);
    try {
      let uploadedVideoUrl: string | null = null;
      if (videoFile) {
        setUploadStatus("動画をアップロード中...");
        uploadedVideoUrl = await uploadToR2(videoFile);
      }

      let uploadedImageUrl: string | null = null;
      if (imageFiles.length > 0) {
        const urls: string[] = [];
        for (let i = 0; i < imageFiles.length; i++) {
          setUploadStatus(`画像を処理・アップロード中 (${i + 1}/${imageFiles.length})...`);
          let f = imageFiles[i];
          try {
            f = await imageCompression(f, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1400,
              useWebWorker: false,
            });
          } catch {}
          const u = await uploadToR2(f);
          urls.push(u);
        }
        uploadedImageUrl = urls.join(",");
      }

      let uploadedFileUrl: string | null = null;
      if (docFile) {
        setUploadStatus("添付資料をアップロード中...");
        uploadedFileUrl = await uploadToR2(docFile);
      }

      setUploadStatus("コラムを公開中...");
      const res = await fetch("/api/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content,
          category,
          youtubeUrl: youtubeUrl.trim() || null,
          videoUrl: uploadedVideoUrl,
          imageUrl: uploadedImageUrl,
          fileUrl: uploadedFileUrl,
          fileName: docFile?.name || null,
          isPinned,
          allowComments,
          targetType,
          targetGrades: selectedGrades,
          targetGroupIds: selectedGroupIds,
          targetUserIds: selectedUserIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "コラムの作成に失敗しました");
      }

      // フォーム初期化
      setTitle("");
      setContent("");
      setYoutubeUrl("");
      setVideoFile(null);
      setImageFiles([]);
      setDocFile(null);
      setTargetType("ALL");
      setSelectedGrades([]);
      setSelectedGroupIds([]);
      setSelectedUserIds([]);
      setIsPinned(false);
      setAllowComments(true);
      setIsModalOpen(false);
      await mutate();
    } catch (err: any) {
      setFormError(err.message || "エラーが発生しました");
    } finally {
      setSubmitting(false);
      setUploadStatus("");
    }
  };

  // 絞り込み処理
  const filteredColumns = columns.filter((col: any) => {
    if (viewMode === "UNREAD" && col.isRead) return false;
    if (viewMode === "BOOKMARKED" && !col.isBookmarked) return false;
    if (viewMode === "PERSONAL" && col.targetType !== "USERS") return false;
    if (selectedCategory !== "ALL" && col.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = col.title?.toLowerCase().includes(q);
      const matchContent = col.content?.toLowerCase().includes(q);
      const matchAuthor = col.author?.name?.toLowerCase().includes(q);
      if (!matchTitle && !matchContent && !matchAuthor) return false;
    }
    return true;
  });

  const renderTargetBadge = (col: any) => {
    if (col.targetType === "ALL") {
      return (
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", color: "var(--text-muted)", fontWeight: 700 }}>
          🌐 全学年
        </span>
      );
    }
    if (col.targetType === "GRADES") {
      const labels = (col.targetGrades || "")
        .split(",")
        .filter(Boolean)
        .map((g: string) => gradeLabel(teamCategory, parseInt(g, 10)))
        .filter(Boolean);
      return (
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(59, 130, 246, 0.18)", color: "#60a5fa", fontWeight: 700 }}>
          🎓 {labels.join("・") || "学年指定"}
        </span>
      );
    }
    if (col.targetType === "GROUPS") {
      const names = (col.targetGroups || []).map((g: any) => g.name).join("・");
      return (
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(16, 185, 129, 0.18)", color: "#34d399", fontWeight: 700 }}>
          👥 {names || "グループ指定"}
        </span>
      );
    }
    if (col.targetType === "USERS") {
      const names = (col.targetUsers || []).map((u: any) => `${u.name}選手`).join("・");
      return (
        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(244, 63, 94, 0.2)", color: "#fb7185", fontWeight: 800 }}>
          🎯 個別配信: {names || "個人指定"}
        </span>
      );
    }
    return null;
  };

  const previewYoutubeIds = extractYoutubeIds(youtubeUrl);

  return (
    <main className="container animate-fade-in" style={{ padding: "28px 20px", maxWidth: "900px", margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 900, display: "flex", alignItems: "center", gap: "8px" }}>
            📚 コラム・教材ライブラリ
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            監督・コーチからの指導動画、技術解説、トレーニング知識をいつでも学べます
          </p>
        </div>

        {isCoach && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
            style={{ padding: "10px 18px", fontWeight: 800, fontSize: "14px", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span>＋</span> コラム・動画を配信する
          </button>
        )}
      </div>

      {/* 表示モード切り替えタブ（すべて / 未読 / ブックマーク / 個別配信） */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", background: "var(--surface)", padding: "5px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", overflowX: "auto" }}>
        <button
          type="button"
          onClick={() => setViewMode("ALL")}
          style={{
            flex: 1,
            padding: "9px 10px",
            borderRadius: "8px",
            border: "none",
            fontWeight: 700,
            fontSize: "13px",
            whiteSpace: "nowrap",
            cursor: "pointer",
            background: viewMode === "ALL" ? "var(--primary)" : "transparent",
            color: viewMode === "ALL" ? "#fff" : "var(--text-muted)",
          }}
        >
          📚 すべて ({columns.length})
        </button>
        <button
          type="button"
          onClick={() => setViewMode("UNREAD")}
          style={{
            flex: 1,
            padding: "9px 10px",
            borderRadius: "8px",
            border: "none",
            fontWeight: 700,
            fontSize: "13px",
            whiteSpace: "nowrap",
            cursor: "pointer",
            background: viewMode === "UNREAD" ? "var(--primary)" : "transparent",
            color: viewMode === "UNREAD" ? "#fff" : "var(--text-muted)",
          }}
        >
          🔴 未読 ({columns.filter((c: any) => !c.isRead).length})
        </button>
        <button
          type="button"
          onClick={() => setViewMode("BOOKMARKED")}
          style={{
            flex: 1,
            padding: "9px 10px",
            borderRadius: "8px",
            border: "none",
            fontWeight: 700,
            fontSize: "13px",
            whiteSpace: "nowrap",
            cursor: "pointer",
            background: viewMode === "BOOKMARKED" ? "var(--primary)" : "transparent",
            color: viewMode === "BOOKMARKED" ? "#fff" : "var(--text-muted)",
          }}
        >
          🔖 保存済み ({columns.filter((c: any) => c.isBookmarked).length})
        </button>
        <button
          type="button"
          onClick={() => setViewMode("PERSONAL")}
          style={{
            flex: 1,
            padding: "9px 10px",
            borderRadius: "8px",
            border: "none",
            fontWeight: 700,
            fontSize: "13px",
            whiteSpace: "nowrap",
            cursor: "pointer",
            background: viewMode === "PERSONAL" ? "var(--primary)" : "transparent",
            color: viewMode === "PERSONAL" ? "#fff" : "var(--text-muted)",
          }}
        >
          🎯 個別指導 ({columns.filter((c: any) => c.targetType === "USERS").length})
        </button>
      </div>

      {/* 検索バー */}
      <div style={{ marginBottom: "14px" }}>
        <input
          type="text"
          className="form-control"
          placeholder="🔍 キーワードでコラム・動画を検索（例: インコース、牽制、ストレッチ...）"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: "100%", fontSize: "14px" }}
        />
      </div>

      {/* カテゴリーチップ */}
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "8px", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setSelectedCategory("ALL")}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 700,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: selectedCategory === "ALL" ? "1.5px solid var(--primary)" : "1px solid var(--border)",
            background: selectedCategory === "ALL" ? "rgba(255, 107, 0, 0.15)" : "var(--surface)",
            color: selectedCategory === "ALL" ? "var(--primary)" : "var(--text-muted)",
          }}
        >
          すべて
        </button>
        {COLUMN_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: "pointer",
                border: active ? `1.5px solid ${cat.color}` : "1px solid var(--border)",
                background: active ? `${cat.color}22` : "var(--surface)",
                color: active ? cat.color : "var(--text-muted)",
              }}
            >
              {cat.icon} {cat.label}
            </button>
          );
        })}
      </div>

      {/* コラム一覧 */}
      {!columnsRes ? (
        <div className="card card-glass" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          読み込み中...
        </div>
      ) : filteredColumns.length === 0 ? (
        <div className="card card-glass" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>📚</div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>
            該当するコラム・教材がありません
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            {isCoach
              ? "右上の「＋ コラム・動画を配信する」から、全体や学年別・個人向けに動画やコラムを配信できます。"
              : "新しいコラムや動画が配信されるとここに表示されます。"}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
          {filteredColumns.map((col: any) => {
            const catMeta = getCategoryMeta(col.category);
            const ytIds = extractYoutubeIds(col.youtubeUrl);
            const thumbUrl =
              col.thumbnailUrl ||
              (ytIds.length > 0 ? `https://img.youtube.com/vi/${ytIds[0]}/hqdefault.jpg` : null) ||
              (col.imageUrl ? col.imageUrl.split(",")[0] : null);

            return (
              <Link
                key={col.id}
                href={`/dashboard/columns/${col.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  className="card card-glass"
                  style={{
                    padding: "18px 20px",
                    borderLeft: col.isPinned
                      ? "4px solid var(--primary)"
                      : !col.isRead
                      ? `4px solid ${catMeta.color}`
                      : "1px solid var(--border)",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                    display: "flex",
                    gap: "16px",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 上段バッジ列 */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
                      {col.isPinned && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(255, 107, 0, 0.2)", color: "var(--primary)", fontWeight: 800 }}>
                          📌 重要・固定
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "2px 9px",
                          borderRadius: "12px",
                          background: `${catMeta.color}22`,
                          color: catMeta.color,
                          fontWeight: 800,
                        }}
                      >
                        {catMeta.icon} {catMeta.label}
                      </span>
                      {renderTargetBadge(col)}
                      {!col.isRead ? (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(239, 68, 68, 0.2)", color: "#f87171", fontWeight: 800 }}>
                          未読
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "12px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", fontWeight: 700 }}>
                          ✓ 見たよ済
                        </span>
                      )}
                    </div>

                    {/* タイトル */}
                    <h2 style={{ fontSize: "17px", fontWeight: 800, marginBottom: "6px", lineHeight: 1.4, color: "var(--text-main)" }}>
                      {col.title}
                    </h2>

                    {/* 本文プレビュー */}
                    {col.content && (
                      <p
                        style={{
                          fontSize: "13px",
                          color: "var(--text-muted)",
                          lineHeight: 1.6,
                          marginBottom: "10px",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {col.content.replace(/^#+\s*/gm, "")}
                      </p>
                    )}

                    {/* メディア・メタ情報フッター */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", fontSize: "12px", color: "var(--text-muted)" }}>
                      <span>✍️ {col.author?.name}</span>
                      <span>🕒 {new Date(col.createdAt).toLocaleDateString("ja-JP")}</span>
                      {ytIds.length > 0 && <span style={{ color: "#f87171", fontWeight: 700 }}>▶️ YouTube動画</span>}
                      {col.videoUrl && <span style={{ color: "#38bdf8", fontWeight: 700 }}>🎬 指導動画</span>}
                      {col.fileUrl && <span style={{ color: "#a78bfa", fontWeight: 700 }}>📄 資料添付</span>}
                      <span>👀 {col.readCount || 0}人が学習済</span>
                      {col.allowComments && <span>💬 {col.commentCount || 0}</span>}
                    </div>
                  </div>

                  {/* 右側：サムネイル＆ブックマークボタン */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => handleToggleBookmark(e, col.id)}
                      title={col.isBookmarked ? "ブックマーク解除" : "ブックマーク保存"}
                      style={{
                        background: col.isBookmarked ? "rgba(234, 179, 8, 0.2)" : "rgba(255,255,255,0.05)",
                        border: col.isBookmarked ? "1px solid #eab308" : "1px solid var(--border)",
                        color: col.isBookmarked ? "#facc15" : "var(--text-muted)",
                        borderRadius: "8px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {col.isBookmarked ? "🔖 保存中" : "🔖 保存"}
                    </button>

                    {thumbUrl && (
                      <div
                        style={{
                          width: "110px",
                          height: "68px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          background: "#000",
                          position: "relative",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <img
                          src={thumbUrl}
                          alt={col.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                        {(ytIds.length > 0 || col.videoUrl) && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "rgba(0,0,0,0.35)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "20px",
                            }}
                          >
                            ▶️
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* 新規コラム作成モーダル */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 2500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => !submitting && setIsModalOpen(false)}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800 }}>📚 新しいコラム・動画を配信</h2>
              <button
                type="button"
                onClick={() => !submitting && setIsModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div style={{ padding: "12px 16px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid var(--danger)", borderRadius: "8px", color: "#f87171", fontSize: "13px", fontWeight: 700, marginBottom: "16px" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateColumn}>
              {/* 1. 配信ターゲット設定 */}
              <div className="form-group" style={{ marginBottom: "18px" }}>
                <label className="form-label">1. 配信する対象（誰に届けるか）</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                  {[
                    { value: "ALL", label: "🌐 全員（全学年）", desc: "チーム全員に公開" },
                    { value: "GRADES", label: "🎓 学年を指定", desc: "1年生だけ・上級生だけ等" },
                    { value: "GROUPS", label: "👥 グループを指定", desc: "投手陣・特定班など" },
                    { value: "USERS", label: "🎯 選手を個別に指定", desc: "個人へのフォーム指導等" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTargetType(opt.value as any)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        textAlign: "left",
                        cursor: "pointer",
                        border: targetType === opt.value ? "2px solid var(--primary)" : "1px solid var(--border)",
                        background: targetType === opt.value ? "rgba(255, 107, 0, 0.12)" : "rgba(255,255,255,0.02)",
                        color: "var(--text-main)",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "13px" }}>{opt.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* 学年選択UI */}
                {targetType === "GRADES" && (
                  <div style={{ marginTop: "12px", padding: "12px", background: "rgba(59, 130, 246, 0.08)", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px", color: "#60a5fa" }}>
                      配信したい学年を選択してください（複数選択可）:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {gradeOpts.map((g) => {
                        const checked = selectedGrades.includes(g.value);
                        return (
                          <button
                            key={g.value}
                            type="button"
                            onClick={() =>
                              setSelectedGrades((prev) =>
                                checked ? prev.filter((v) => v !== g.value) : [...prev, g.value]
                              )
                            }
                            style={{
                              padding: "6px 14px",
                              borderRadius: "18px",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              border: checked ? "1.5px solid #3b82f6" : "1px solid var(--border)",
                              background: checked ? "#3b82f6" : "var(--surface)",
                              color: checked ? "#fff" : "var(--text-main)",
                            }}
                          >
                            {checked ? "✓ " : ""}{g.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* グループ選択UI */}
                {targetType === "GROUPS" && (
                  <div style={{ marginTop: "12px", padding: "12px", background: "rgba(16, 185, 129, 0.08)", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px", color: "#34d399" }}>
                      配信したいグループを選択してください:
                    </div>
                    {groups.length === 0 ? (
                      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        まだグループが作成されていません（チーム名簿画面から作成できます）。
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {groups.map((grp: any) => {
                          const checked = selectedGroupIds.includes(grp.id);
                          return (
                            <button
                              key={grp.id}
                              type="button"
                              onClick={() =>
                                setSelectedGroupIds((prev) =>
                                  checked ? prev.filter((id) => id !== grp.id) : [...prev, grp.id]
                                )
                              }
                              style={{
                                padding: "6px 14px",
                                borderRadius: "18px",
                                fontSize: "13px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: checked ? "1.5px solid #10b981" : "1px solid var(--border)",
                                background: checked ? "#10b981" : "var(--surface)",
                                color: checked ? "#fff" : "var(--text-main)",
                              }}
                            >
                              {checked ? "✓ " : ""}{grp.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 個別選手選択UI */}
                {targetType === "USERS" && (
                  <div style={{ marginTop: "12px", padding: "12px", background: "rgba(244, 63, 94, 0.08)", borderRadius: "8px", border: "1px solid rgba(244, 63, 94, 0.3)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px", color: "#fb7185" }}>
                      個別に配信したい選手を選択してください（選んだ選手と保護者のみ閲覧できます）:
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="選手名・背番号で絞り込み..."
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      style={{ marginBottom: "8px", fontSize: "12px", padding: "6px 10px" }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "150px", overflowY: "auto" }}>
                      {members
                        .filter((m: any) => {
                          if (!playerSearch.trim()) return true;
                          return (
                            m.name?.toLowerCase().includes(playerSearch.toLowerCase()) ||
                            m.jerseyNumber?.includes(playerSearch)
                          );
                        })
                        .map((m: any) => {
                          const checked = selectedUserIds.includes(m.id);
                          const gLabel = gradeLabel(teamCategory, m.grade);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setSelectedUserIds((prev) =>
                                  checked ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                )
                              }
                              style={{
                                padding: "5px 12px",
                                borderRadius: "16px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                                border: checked ? "1.5px solid #f43f5e" : "1px solid var(--border)",
                                background: checked ? "#f43f5e" : "var(--surface)",
                                color: checked ? "#fff" : "var(--text-main)",
                              }}
                            >
                              {checked ? "✓ " : ""}
                              {m.jerseyNumber ? `#${m.jerseyNumber} ` : ""}
                              {m.name}
                              {gLabel ? ` (${gLabel})` : ""}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. カテゴリー & タイトル */}
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label className="form-label">カテゴリー</label>
                  <select
                    className="form-control"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={submitting}
                  >
                    {COLUMN_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">タイトル（必須）</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="タイトルを入力"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* 3. YouTube動画URL */}
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label">▶️ 参考YouTube動画URL（任意・複数ある場合は改行）</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="YouTubeのURLを貼り付け"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={submitting}
                />
                {previewYoutubeIds.length > 0 && (
                  <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                    {previewYoutubeIds.map((vid) => (
                      <div key={vid} style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: "8px", overflow: "hidden" }}>
                        <iframe
                          src={`https://www.youtube.com/embed/${vid}`}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                          allowFullScreen
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. 直接動画・画像・PDF資料アップロード */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "16px" }}>
                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>🎬 指導動画ファイル</div>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    style={{ fontSize: "11px", width: "100%" }}
                    disabled={submitting}
                  />
                  {videoFile && <div style={{ fontSize: "11px", color: "#38bdf8", marginTop: "4px" }}>✓ {videoFile.name}</div>}
                </div>

                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>📸 解説画像（複数可）</div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setImageFiles(e.target.files ? Array.from(e.target.files) : [])}
                    style={{ fontSize: "11px", width: "100%" }}
                    disabled={submitting}
                  />
                  {imageFiles.length > 0 && (
                    <div style={{ fontSize: "11px", color: "#34d399", marginTop: "4px" }}>
                      ✓ {imageFiles.length}枚の画像を選択中
                    </div>
                  )}
                </div>

                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>📄 PDF・資料ファイル</div>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    style={{ fontSize: "11px", width: "100%" }}
                    disabled={submitting}
                  />
                  {docFile && <div style={{ fontSize: "11px", color: "#a78bfa", marginTop: "4px" }}>✓ {docFile.name}</div>}
                </div>
              </div>

              {/* 5. 解説本文 */}
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label">
                  📝 コラム本文・解説ポイント
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400, marginLeft: "8px" }}>
                    （行頭に「## 」を付けると大見出し、「### 」で小見出しになります）
                  </span>
                </label>
                <textarea
                  className="form-control"
                  rows={8}
                  placeholder="解説本文や意識してほしいポイントを入力してください"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={submitting}
                  style={{ lineHeight: 1.7 }}
                />
              </div>

              {/* 6. オプション設定 */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", marginBottom: "20px", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    disabled={submitting}
                  />
                  📌 重要コラムとして一覧の上部に固定する
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                    disabled={submitting}
                  />
                  💬 選手からの質問・感想コメントを受け付ける
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ minWidth: "160px" }}>
                  {submitting ? uploadStatus || "配信中..." : "コラムの配信を確定する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
