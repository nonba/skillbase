"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface Post {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

interface Manager {
  id: string;
  name: string;
  role: string;
}

interface Conversation {
  id: string;
  otherParticipants: { id: string; name: string }[];
  latestMessage: { content: string; createdAt: string; sender: { id: string; name: string } } | null;
  hasUnread: boolean;
}

export default function ObPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: postsRes } = useSWR<{ posts: Post[] }>("/api/posts", fetcher);
  const { data: conversations, mutate: mutateConversations } = useSWR<Conversation[]>("/api/messages", fetcher);
  const { data: managersRes } = useSWR<{ members: Manager[] }>(
    showNewMessage ? "/api/team/members" : null,
    fetcher
  );
  const managers = managersRes?.members || [];

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  const handleStartMessage = async (managerId: string) => {
    if (!session?.user?.teamId || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserIds: [managerId], teamId: session.user.teamId }),
      });
      const conv = await res.json();
      if (res.ok) {
        router.push(`/ob/messages/${conv.id}`);
      } else {
        alert(conv.error || "メッセージの開始に失敗しました。");
      }
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setCreating(false);
      setShowNewMessage(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", paddingTop: "20px" }}>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
        卒団おめでとうございます。ここではチームからのお知らせの確認と、指導者へのメッセージのみご利用いただけます。
      </p>

      {/* チームからのお知らせ（OB向け配信） */}
      <section>
        <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>📢 チームからのお知らせ</h2>
        {!postsRes ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>読み込み中...</p>
        ) : postsRes.posts.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
            まだお知らせはありません。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {postsRes.posts.map((post) => (
              <div key={post.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
                  {post.author.name} ・ {formatDate(post.createdAt)}
                </div>
                {post.imageUrl && (
                  <img src={post.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: "8px", marginBottom: "8px" }} />
                )}
                <div style={{ fontSize: "14px", color: "var(--text-main)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {post.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 指導者へのメッセージ */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>✉️ 指導者へのメッセージ</h2>
          <button
            onClick={() => setShowNewMessage(true)}
            style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: "20px", padding: "6px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            ＋ 新規
          </button>
        </div>

        {!conversations ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>読み込み中...</p>
        ) : conversations.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px" }}>
            まだメッセージはありません。「＋ 新規」から指導者に連絡できます。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {conversations.map((conv) => {
              const names = conv.otherParticipants.map((p) => p.name).join("、");
              const preview = conv.latestMessage ? (conv.latestMessage.content || "📷 画像") : "まだメッセージがありません";
              return (
                <div
                  key={conv.id}
                  onClick={() => router.push(`/ob/messages/${conv.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "10px",
                    background: conv.hasUnread ? "rgba(255,71,87,0.06)" : "var(--surface)",
                    border: conv.hasUnread ? "1px solid rgba(255,71,87,0.2)" : "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), #ff8c00)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "15px", flexShrink: 0 }}>
                    {names.charAt(0) || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: conv.hasUnread ? 800 : 600, fontSize: "14px", color: "var(--text-main)" }}>{names || "指導者"}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 新規メッセージ（指導者選択） */}
      {showNewMessage && (
        <div
          onClick={() => setShowNewMessage(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: "24px 20px", width: "100%", maxWidth: "600px", maxHeight: "70vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 800, marginBottom: "16px" }}>指導者を選択</h3>
            {managers.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>読み込み中...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {managers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleStartMessage(m.id)}
                    disabled={creating}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "10px", background: "var(--bg)", border: "1px solid var(--border)", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), #ff8c00)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "13px" }}>
                      {m.name.charAt(0)}
                    </div>
                    <span style={{ fontSize: "14px", color: "var(--text-main)", fontWeight: 600 }}>{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
