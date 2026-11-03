"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import {
  COACH_STAMPS,
  getActivityTypeMeta,
  getConditionMeta,
  getCoachStampMeta,
} from "@/lib/notes";
import { formatGrade } from "@/lib/grade";

export default function BaseballNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const { data, mutate } = useSWR(`/api/notes/${id}`, fetcher);
  const { data: teamData } = useSWR(
    session?.user?.teamId ? "/api/team/info" : null,
    fetcher
  );

  const [replyContent, setReplyContent] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [stamping, setStamping] = useState(false);

  const note = data?.note;
  const isCoach = !!data?.isCoach;
  const isAuthor = !!data?.isAuthor;
  const teamCategory = teamData?.team?.category || "JUNIOR_HIGH";

  if (!data) {
    return (
      <main
        className="container"
        style={{ padding: "40px 20px", maxWidth: "840px", margin: "0 auto" }}
      >
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
      </main>
    );
  }

  if (data.error || !note) {
    return (
      <main
        className="container"
        style={{ padding: "40px 20px", maxWidth: "840px", margin: "0 auto" }}
      >
        <div
          className="card card-glass"
          style={{ padding: "40px", textAlign: "center" }}
        >
          <p
            style={{
              color: "var(--danger)",
              fontWeight: 700,
              marginBottom: "16px",
            }}
          >
            {data.error || "野球ノートが見つかりません。"}
          </p>
          <Link href="/dashboard/notes" className="btn btn-secondary">
            ← 野球ノート一覧へ戻る
          </Link>
        </div>
      </main>
    );
  }

  const act = getActivityTypeMeta(note.activityType);
  const cond = getConditionMeta(note.condition);
  const stamp = getCoachStampMeta(note.coachStamp);
  const gradeLabel = formatGrade(teamCategory, note.author?.grade);
  const images = note.imageUrl
    ? note.imageUrl.split(",").filter(Boolean)
    : [];

  const handleStamp = async (stampValue: string) => {
    setStamping(true);
    try {
      const nextStamp = note.coachStamp === stampValue ? null : stampValue;
      await fetch(`/api/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachStamp: nextStamp }),
      });
      await mutate();
    } catch (err) {
      console.error(err);
    } finally {
      setStamping(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    setSubmittingReply(true);
    try {
      const res = await fetch(`/api/notes/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      if (res.ok) {
        setReplyContent("");
        await mutate();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("この野球ノートを削除してもよろしいですか？")) return;
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/notes");
    }
  };

  return (
    <main
      className="container animate-fade-in"
      style={{ padding: "24px 16px 100px", maxWidth: "840px", margin: "0 auto" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <Link
          href="/dashboard/notes"
          style={{
            color: "var(--text-muted)",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          ← 野球ノート一覧へ戻る
        </Link>
        {(isAuthor || isCoach) && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDelete}
            style={{ padding: "6px 12px", fontSize: "12px", color: "#dc2626" }}
          >
            🗑️ 削除
          </button>
        )}
      </div>

      <article
        className="card card-glass"
        style={{ padding: "24px", marginBottom: "20px", position: "relative" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "14px",
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
                fontSize: "15px",
                padding: "4px 12px",
                borderRadius: "8px",
                background: "var(--surface-hover)",
              }}
            >
              {note.author?.jerseyNumber ? `#${note.author.jerseyNumber} ` : ""}
              {note.author?.name}
              {gradeLabel ? ` (${gradeLabel})` : ""}
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "var(--text-muted)",
              }}
            >
              📅 {note.practiceDate}
            </span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: "12px",
                background: `${act.color}18`,
                color: act.color,
                border: `1px solid ${act.color}44`,
              }}
            >
              {act.icon} {act.label}
            </span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: "12px",
                background: `${cond.color}18`,
                color: cond.color,
                border: `1px solid ${cond.color}44`,
              }}
            >
              {cond.icon} 体調:{cond.label}
            </span>
          </div>

          {stamp && (
            <div
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                border: "2px solid #ef4444",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#dc2626",
                fontWeight: 900,
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{ fontSize: "18px" }}>{stamp.icon}</span>
              <span>
                {stamp.label}
                {note.stampedByName ? `（${note.stampedByName}）` : ""}
              </span>
            </div>
          )}
        </div>

        {note.condition === "PAIN" && note.painNote && (
          <div
            style={{
              padding: "12px 14px",
              marginBottom: "16px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#dc2626",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            ⚠️ 肩・肘・身体の違和感メモ: {note.painNote}
          </div>
        )}

        <h1
          style={{
            fontSize: "clamp(18px, 4vw, 24px)",
            fontWeight: 900,
            marginBottom: "20px",
            lineHeight: 1.4,
          }}
        >
          {note.title}
        </h1>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(59, 130, 246, 0.06)",
              borderLeft: "4px solid #3b82f6",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "#2563eb",
                marginBottom: "6px",
              }}
            >
              ① 今日の練習・試合で意識したこと
            </div>
            <div
              style={{
                fontSize: "14px",
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}
            >
              {note.themeText || "（未記入）"}
            </div>
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(16, 185, 129, 0.06)",
              borderLeft: "4px solid #10b981",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "#059669",
                marginBottom: "6px",
              }}
            >
              ② うまくいった点・見つかった課題（反省）
            </div>
            <div
              style={{
                fontSize: "14px",
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}
            >
              {note.reviewText || "（未記入）"}
            </div>
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "rgba(245, 158, 11, 0.06)",
              borderLeft: "4px solid #f59e0b",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "#d97706",
                marginBottom: "6px",
              }}
            >
              ③ 次回の目標・監督やコーチへの質問
            </div>
            <div
              style={{
                fontSize: "14px",
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}
            >
              {note.goalText || "（未記入）"}
            </div>
          </div>
        </div>

        {note.videoUrl && (
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 800,
                marginBottom: "8px",
                color: "#0284c7",
              }}
            >
              🎬 提出されたフォーム・自主練動画
            </div>
            <video
              src={note.videoUrl}
              controls
              playsInline
              style={{
                width: "100%",
                maxHeight: "460px",
                borderRadius: "12px",
                background: "#000",
              }}
            />
          </div>
        )}

        {images.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            {images.map((imgUrl: string, idx: number) => (
              <a
                key={idx}
                href={imgUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  borderRadius: "10px",
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                }}
              >
                <img
                  src={imgUrl}
                  alt={`ノート添付画像 ${idx + 1}`}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </a>
            ))}
          </div>
        )}

        {isCoach && (
          <div
            style={{
              marginTop: "20px",
              paddingTop: "18px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 800,
                color: "var(--text-muted)",
                marginBottom: "10px",
              }}
            >
              💮 指導者スタンプを押す（ワンタップで選手と保護者に共有されます）:
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {COACH_STAMPS.map((s) => {
                const active = note.coachStamp === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={stamping}
                    onClick={() => handleStamp(s.value)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      fontWeight: 800,
                      cursor: "pointer",
                      border: active
                        ? "2px solid #ef4444"
                        : "1px solid var(--border)",
                      background: active
                        ? "rgba(239, 68, 68, 0.14)"
                        : "var(--surface)",
                      color: active ? "#dc2626" : "var(--text-main)",
                    }}
                  >
                    {s.icon} {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </article>

      <section className="card card-glass" style={{ padding: "24px" }}>
        <h2
          style={{
            fontSize: "17px",
            fontWeight: 800,
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>🖍️</span>
          <span>
            監督・コーチからの赤ペンアドバイス & やり取り (
            {note.replies?.length || 0})
          </span>
        </h2>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          {(note.replies || []).length === 0 ? (
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              まだ返信はありません。
            </p>
          ) : (
            note.replies.map((reply: any) => {
              const isCoachReply =
                reply.author?.role === "MANAGER" || reply.author?.isOwner;
              return (
                <div
                  key={reply.id}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: isCoachReply
                      ? "rgba(239, 68, 68, 0.06)"
                      : "var(--surface-hover)",
                    border: isCoachReply
                      ? "1.5px solid rgba(239, 68, 68, 0.35)"
                      : "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: "13px",
                          color: isCoachReply ? "#dc2626" : "var(--text-main)",
                        }}
                      >
                        {isCoachReply ? "🖍️ " : "⚾ "}
                        {reply.author?.name}
                      </span>
                      {isCoachReply && (
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "6px",
                            background: "rgba(239, 68, 68, 0.16)",
                            color: "#dc2626",
                            fontWeight: 800,
                          }}
                        >
                          赤ペン指導
                        </span>
                      )}
                    </div>
                    <span
                      style={{ fontSize: "11px", color: "var(--text-muted)" }}
                    >
                      {new Date(reply.createdAt).toLocaleString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      lineHeight: 1.75,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {reply.content}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleReplySubmit}>
          <textarea
            className="form-control"
            rows={3}
            placeholder={
              isCoach
                ? "選手へのアドバイス・回答を入力..."
                : "監督・コーチへの返信や質問を入力..."
            }
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            disabled={submittingReply}
            style={{ marginBottom: "10px" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submittingReply || !replyContent.trim()}
            >
              {submittingReply
                ? "送信中..."
                : isCoach
                ? "🖍️ 赤ペンアドバイスを送信"
                : "返信を送信"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
