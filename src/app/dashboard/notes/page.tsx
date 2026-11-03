"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import imageCompression from "browser-image-compression";
import { fetcher } from "@/lib/fetcher";
import {
  ACTIVITY_TYPES,
  NOTE_CONDITIONS,
  COACH_STAMPS,
  getActivityTypeMeta,
  getConditionMeta,
  getCoachStampMeta,
} from "@/lib/notes";
import { getGradeOptions, formatGrade } from "@/lib/grade";

export default function BaseballNotesPage() {
  const { data: session } = useSession();
  const { data, mutate } = useSWR(
    session?.user?.teamId ? "/api/notes" : null,
    fetcher
  );
  const { data: teamData } = useSWR(
    session?.user?.teamId ? "/api/team/info" : null,
    fetcher
  );

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [gradeFilter, setGradeFilter] = useState("ALL");
  const [playerFilter, setPlayerFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [practiceDate, setPracticeDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [activityType, setActivityType] = useState("PRACTICE");
  const [condition, setCondition] = useState("GOOD");
  const [painNote, setPainNote] = useState("");
  const [title, setTitle] = useState("");
  const [themeText, setThemeText] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [goalText, setGoalText] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const notes = data?.notes || [];
  const isCoach = !!data?.isCoach;
  const unrepliedCount = data?.unrepliedCount || 0;
  const teamCategory = teamData?.team?.category || "JUNIOR_HIGH";
  const gradeOptions = getGradeOptions(teamCategory).filter((g) => g.value > 0);
  const playerMembers = (teamData?.team?.members || []).filter(
    (m: any) => m.role === "PLAYER" && !m.graduated
  );

  const uploadFileToR2 = async (file: File): Promise<string> => {
    if (file.size <= 90 * 1024 * 1024) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/r2", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("ファイルのアップロードに失敗しました");
      const json = await res.json();
      return json.publicUrl;
    } else {
      const res = await fetch("/api/upload/r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!res.ok) throw new Error("署名URLの取得に失敗しました");
      const json = await res.json();
      const putRes = await fetch(json.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("動画のアップロードに失敗しました");
      return json.publicUrl;
    }
  };

  const handleQuickStamp = async (
    e: React.MouseEvent,
    noteId: string,
    stampValue: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachStamp: stampValue }),
      });
      await mutate();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!title.trim()) {
      setErrorMsg("今日のテーマ（一言タイトル）を入力してください。");
      return;
    }
    if (!themeText.trim() && !reviewText.trim() && !goalText.trim()) {
      setErrorMsg("振り返り内容（①〜③のいずれか）を入力してください。");
      return;
    }

    setSubmitting(true);
    try {
      let uploadedVideoUrl: string | null = null;
      if (videoFile) {
        setProgressText("動画をアップロード中...");
        uploadedVideoUrl = await uploadFileToR2(videoFile);
      }

      let uploadedImageUrl: string | null = null;
      if (imageFiles.length > 0) {
        const urls: string[] = [];
        for (let i = 0; i < imageFiles.length; i++) {
          setProgressText(`画像をアップロード中 (${i + 1}/${imageFiles.length})...`);
          let targetFile: File = imageFiles[i];
          try {
            targetFile = await imageCompression(targetFile, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1400,
              useWebWorker: false,
            });
          } catch {}
          const url = await uploadFileToR2(targetFile);
          urls.push(url);
        }
        uploadedImageUrl = urls.join(",");
      }

      setProgressText("野球ノートを提出中...");
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceDate,
          activityType,
          condition,
          painNote: condition === "PAIN" ? painNote : null,
          title: title.trim(),
          themeText: themeText.trim(),
          reviewText: reviewText.trim(),
          goalText: goalText.trim(),
          videoUrl: uploadedVideoUrl,
          imageUrl: uploadedImageUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "野球ノートの提出に失敗しました");
      }

      setTitle("");
      setThemeText("");
      setReviewText("");
      setGoalText("");
      setCondition("GOOD");
      setPainNote("");
      setVideoFile(null);
      setImageFiles([]);
      setIsModalOpen(false);
      await mutate();
    } catch (err: any) {
      setErrorMsg(err.message || "エラーが発生しました");
    } finally {
      setSubmitting(false);
      setProgressText("");
    }
  };

  const filteredNotes = notes.filter((n: any) => {
    if (statusFilter === "UNREPLIED" && n.hasCoachFeedback) return false;
    if (statusFilter === "PAIN" && n.condition !== "PAIN") return false;
    if (gradeFilter !== "ALL" && String(n.author?.grade) !== gradeFilter)
      return false;
    if (playerFilter !== "ALL" && n.authorId !== playerFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = n.title?.toLowerCase().includes(q);
      const matchTheme = n.themeText?.toLowerCase().includes(q);
      const matchReview = n.reviewText?.toLowerCase().includes(q);
      const matchGoal = n.goalText?.toLowerCase().includes(q);
      const matchAuthor = n.author?.name?.toLowerCase().includes(q);
      if (!matchTitle && !matchTheme && !matchReview && !matchGoal && !matchAuthor)
        return false;
    }
    return true;
  });

  const painCount = notes.filter((n: any) => n.condition === "PAIN").length;

  return (
    <main
      className="container animate-fade-in"
      style={{ padding: "24px 16px 100px", maxWidth: "960px", margin: "0 auto" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "26px" }}>📓</span>
            <h1 style={{ fontSize: "22px", fontWeight: 900, margin: 0 }}>
              野球ノート（交換日記）
            </h1>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              marginTop: "4px",
            }}
          >
            {isCoach
              ? "選手が提出した日々の振り返り・課題・フォーム動画を確認し、赤ペン返信やスタンプでフィードバックできます（他の選手には非公開）。"
              : "日々の練習や試合で意識したこと・課題を書き留めて監督・コーチと共有するあなた専用の野球ノートです（他の選手には公開されません）。"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsModalOpen(true)}
          style={{
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>✏️</span>
          <span>今日の野球ノートを書く</span>
        </button>
      </div>

      <div
        className="card card-glass"
        style={{
          padding: "14px 16px",
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {[
            { id: "ALL", label: `すべて (${notes.length})` },
            ...(isCoach
              ? [
                  { id: "UNREPLIED", label: `🔴 未返信・未確認 (${unrepliedCount})` },
                  { id: "PAIN", label: `⚠️ 張り・違和感報告 (${painCount})` },
                ]
              : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: "7px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 700,
                border:
                  statusFilter === tab.id
                    ? "1px solid var(--primary)"
                    : "1px solid var(--border)",
                background:
                  statusFilter === tab.id
                    ? "var(--primary)"
                    : "var(--surface-hover)",
                color: statusFilter === tab.id ? "#fff" : "var(--text-main)",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}

          {isCoach && (
            <>
              <select
                className="form-control"
                value={gradeFilter}
                onChange={(e) => {
                  setGradeFilter(e.target.value);
                  setPlayerFilter("ALL");
                }}
                style={{
                  width: "auto",
                  minWidth: "110px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  height: "34px",
                }}
              >
                <option value="ALL">🎓 全学年</option>
                {gradeOptions.map((g) => (
                  <option key={g.value} value={String(g.value)}>
                    {g.label}
                  </option>
                ))}
              </select>

              <select
                className="form-control"
                value={playerFilter}
                onChange={(e) => setPlayerFilter(e.target.value)}
                style={{
                  width: "auto",
                  minWidth: "150px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  height: "34px",
                }}
              >
                <option value="ALL">👤 すべての選手</option>
                {playerMembers
                  .filter(
                    (m: any) =>
                      gradeFilter === "ALL" || String(m.grade) === gradeFilter
                  )
                  .map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.jerseyNumber ? `#${m.jerseyNumber} ` : ""}
                      {m.name}
                    </option>
                  ))}
              </select>
            </>
          )}

          <input
            type="text"
            className="form-control"
            placeholder="🔍 キーワード・選手名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: "180px",
              padding: "6px 12px",
              fontSize: "12px",
              height: "34px",
            }}
          />
        </div>
      </div>

      {data ? (
        filteredNotes.length === 0 ? (
          <div
            className="card card-glass"
            style={{ padding: "48px 20px", textAlign: "center" }}
          >
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📓</div>
            <p
              style={{
                fontWeight: 700,
                fontSize: "16px",
                marginBottom: "6px",
              }}
            >
              まだ野球ノートがありません
            </p>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "18px",
              }}
            >
              「✏️ 今日の野球ノートを書く」ボタンから、今日の練習で意識したことや課題を提出してみましょう！
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsModalOpen(true)}
            >
              ✏️ 最初のノートを書く
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {filteredNotes.map((note: any) => {
              const act = getActivityTypeMeta(note.activityType);
              const cond = getConditionMeta(note.condition);
              const stamp = getCoachStampMeta(note.coachStamp);
              const gradeLabel = formatGrade(teamCategory, note.author?.grade);

              return (
                <Link
                  key={note.id}
                  href={`/dashboard/notes/${note.id}`}
                  className="card card-glass"
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "var(--text-main)",
                    padding: "18px 20px",
                    borderLeft: note.hasCoachFeedback
                      ? "4px solid #10b981"
                      : "4px solid var(--primary)",
                    transition: "var(--transition)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 900,
                          fontSize: "14px",
                          padding: "3px 10px",
                          borderRadius: "8px",
                          background: "var(--surface-hover)",
                        }}
                      >
                        {note.author?.jerseyNumber
                          ? `#${note.author.jerseyNumber} `
                          : ""}
                        {note.author?.name}
                        {gradeLabel ? ` (${gradeLabel})` : ""}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                        }}
                      >
                        📅 {note.practiceDate}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "2px 8px",
                          borderRadius: "10px",
                          background: `${act.color}18`,
                          color: act.color,
                          border: `1px solid ${act.color}44`,
                        }}
                      >
                        {act.icon} {act.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "2px 8px",
                          borderRadius: "10px",
                          background: `${cond.color}18`,
                          color: cond.color,
                          border: `1px solid ${cond.color}44`,
                        }}
                      >
                        {cond.icon} 体調:{cond.label}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {stamp ? (
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 900,
                            padding: "4px 10px",
                            borderRadius: "20px",
                            background: "rgba(239, 68, 68, 0.12)",
                            border: "1.5px solid #ef4444",
                            color: "#dc2626",
                          }}
                        >
                          {stamp.icon} {stamp.label}
                        </span>
                      ) : note.hasCoachFeedback ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "3px 10px",
                            borderRadius: "12px",
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#059669",
                          }}
                        >
                          ✅ 返信済み
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "3px 10px",
                            borderRadius: "12px",
                            background: "rgba(79, 70, 229, 0.12)",
                            color: "var(--primary)",
                          }}
                        >
                          🔴 指導者未確認
                        </span>
                      )}
                    </div>
                  </div>

                  {note.condition === "PAIN" && note.painNote && (
                    <div
                      style={{
                        padding: "8px 12px",
                        marginBottom: "10px",
                        borderRadius: "8px",
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                        fontSize: "12px",
                        color: "#dc2626",
                        fontWeight: 700,
                      }}
                    >
                      ⚠️ 張り・違和感メモ: {note.painNote}
                    </div>
                  )}

                  <h2
                    style={{
                      fontSize: "16px",
                      fontWeight: 800,
                      marginBottom: "10px",
                    }}
                  >
                    {note.title}
                  </h2>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    {note.themeText && (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          background: "var(--surface-hover)",
                          fontSize: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            color: "#2563eb",
                            marginBottom: "2px",
                            fontSize: "11px",
                          }}
                        >
                          ① 意識したこと・テーマ
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {note.themeText}
                        </div>
                      </div>
                    )}
                    {note.reviewText && (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          background: "var(--surface-hover)",
                          fontSize: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            color: "#059669",
                            marginBottom: "2px",
                            fontSize: "11px",
                          }}
                        >
                          ② 良かった点・課題
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {note.reviewText}
                        </div>
                      </div>
                    )}
                    {note.goalText && (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          background: "var(--surface-hover)",
                          fontSize: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            color: "#d97706",
                            marginBottom: "2px",
                            fontSize: "11px",
                          }}
                        >
                          ③ 次回の目標・質問
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {note.goalText}
                        </div>
                      </div>
                    )}
                  </div>

                  {note.latestReply && (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: "rgba(239, 68, 68, 0.06)",
                        border: "1px dashed rgba(239, 68, 68, 0.4)",
                        fontSize: "12px",
                        marginBottom: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          color: "#dc2626",
                          marginRight: "6px",
                        }}
                      >
                        🖍️ {note.latestReply.author?.name}:
                      </span>
                      <span style={{ color: "var(--text-main)" }}>
                        {note.latestReply.content}
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      {note.videoUrl && (
                        <span style={{ color: "#0284c7", fontWeight: 700 }}>
                          🎬 フォーム動画あり
                        </span>
                      )}
                      {note.imageUrl && (
                        <span style={{ color: "#059669", fontWeight: 700 }}>
                          📸 写真添付あり
                        </span>
                      )}
                      <span>💬 やり取り {note.replyCount || 0}件</span>
                    </div>

                    {isCoach && (
                      <div
                        style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {COACH_STAMPS.map((s) => {
                          const active = note.coachStamp === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              onClick={(e) =>
                                handleQuickStamp(
                                  e,
                                  note.id,
                                  active ? "" : s.value
                                )
                              }
                              style={{
                                padding: "4px 9px",
                                borderRadius: "14px",
                                fontSize: "11px",
                                fontWeight: 800,
                                cursor: "pointer",
                                border: active
                                  ? "1.5px solid #ef4444"
                                  : "1px solid var(--border)",
                                background: active
                                  ? "rgba(239, 68, 68, 0.14)"
                                  : "var(--surface)",
                                color: active ? "#dc2626" : "var(--text-muted)",
                              }}
                            >
                              {s.icon} {s.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )
      ) : (
        <div
          className="card card-glass"
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          読み込み中...
        </div>
      )}

      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "18px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 800 }}>
                📓 今日の野球ノートを提出
              </h2>
              <button
                type="button"
                onClick={() => !submitting && setIsModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "20px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid var(--danger)",
                  borderRadius: "8px",
                  color: "#dc2626",
                  fontSize: "13px",
                  fontWeight: 700,
                  marginBottom: "16px",
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateNote}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <label className="form-label">📅 日付</label>
                  <input
                    type="date"
                    className="form-control"
                    value={practiceDate}
                    onChange={(e) => setPracticeDate(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">⚾ 活動区分</label>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {ACTIVITY_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setActivityType(t.value)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "10px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          border:
                            activityType === t.value
                              ? `2px solid ${t.color}`
                              : "1px solid var(--border)",
                          background:
                            activityType === t.value
                              ? `${t.color}18`
                              : "var(--surface)",
                          color: "var(--text-main)",
                        }}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label">
                  🩺 今日のコンディション（体調・肩肘の張りチェック）
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "8px",
                  }}
                >
                  {NOTE_CONDITIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCondition(c.value)}
                      style={{
                        padding: "8px 6px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        textAlign: "center",
                        border:
                          condition === c.value
                            ? `2px solid ${c.color}`
                            : "1px solid var(--border)",
                        background:
                          condition === c.value
                            ? `${c.color}18`
                            : "var(--surface)",
                        color: "var(--text-main)",
                      }}
                    >
                      <div style={{ fontSize: "18px" }}>{c.icon}</div>
                      <div>{c.label}</div>
                    </button>
                  ))}
                </div>
                {condition === "PAIN" && (
                  <input
                    type="text"
                    className="form-control"
                    placeholder="違和感がある部位や症状を入力（例：右肘の内側に軽い張り）"
                    value={painNote}
                    onChange={(e) => setPainNote(e.target.value)}
                    style={{ marginTop: "8px", borderColor: "#ef4444" }}
                  />
                )}
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label">
                  📌 今日のテーマ（一言タイトル・必須）
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="例：インコースのさばき方 / オープン戦の振り返り"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ color: "#2563eb" }}>
                  ① 今日の練習・試合で意識したこと
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="今日意識したポイントを入力..."
                  value={themeText}
                  onChange={(e) => setThemeText(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ color: "#059669" }}>
                  ② うまくいった点・見つかった課題（反省）
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="良かった点や見つかった課題を入力..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ color: "#d97706" }}>
                  ③ 次回の目標・監督やコーチへの質問
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="次回の目標や指導者への質問を入力..."
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "10px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    background: "var(--surface-hover)",
                    border: "1px dashed var(--border)",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      marginBottom: "6px",
                    }}
                  >
                    🎬 自主練・フォーム動画（任意）
                  </div>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    style={{ fontSize: "11px", width: "100%" }}
                    disabled={submitting}
                  />
                  {videoFile && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#0284c7",
                        marginTop: "4px",
                      }}
                    >
                      ✓ {videoFile.name}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    background: "var(--surface-hover)",
                    border: "1px dashed var(--border)",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      marginBottom: "6px",
                    }}
                  >
                    📸 写真・メモ画像（任意）
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) =>
                      setImageFiles(
                        e.target.files ? Array.from(e.target.files) : []
                      )
                    }
                    style={{ fontSize: "11px", width: "100%" }}
                    disabled={submitting}
                  />
                  {imageFiles.length > 0 && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#059669",
                        marginTop: "4px",
                      }}
                    >
                      ✓ {imageFiles.length}枚の画像を選択中
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ minWidth: "160px" }}
                >
                  {submitting ? progressText || "提出中..." : "ノートを提出する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
