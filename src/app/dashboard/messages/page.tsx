"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface Member {
  id: string;
  name: string;
  role: string;
  parents?: { id: string; name: string }[];
  children?: { id: string; name: string }[];
}

interface Conversation {
  id: string;
  otherParticipants: { id: string; name: string }[];
  latestMessage: {
    content: string;
    createdAt: string;
    sender: { id: string; name: string };
  } | null;
  hasUnread: boolean;
}

export default function MessagesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showNewDM, setShowNewDM] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [includeParent, setIncludeParent] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: conversations, mutate } = useSWR<Conversation[]>("/api/messages", fetcher, {
    revalidateOnFocus: true, // 自動ポーリングは運用開始まで停止
  });

  const { data: teamRes } = useSWR(session?.user?.teamId ? "/api/team/info" : null, fetcher);
  const teamId = session?.user?.teamId;

  // メンバー一覧（新規DM作成モーダルが開いた時のみ取得）
  const { data: membersData } = useSWR(
    showNewDM ? "/api/team/members" : null,
    fetcher
  );
  const members: Member[] = membersData?.members || [];

  // 選択したユーザーに親アカウントがあるかチェック
  const selectedMembers = members.filter((m) => selectedUserIds.includes(m.id));
  const selectedWithParent = selectedMembers.filter((m) => m.parents && m.parents.length > 0);

  const handleSelectUser = (userId: string) => {
    // メッセージは1対1が基本（ROADMAP方針）。管理者含め自由なグループ作成は不可
    // （連絡の置き場はタイムライン/予定コメント/DMの3分割を維持するため）。
    // 親子を含める場合は includeParent で制御。
    setSelectedUserIds(
      selectedUserIds.includes(userId) ? [] : [userId]
    );
    setIncludeParent(false);
  };

  const handleStartDM = async () => {
    if (selectedUserIds.length === 0 || !teamId) return;
    setCreating(true);
    try {
      // 親アカウントを含める場合、親のIDも追加
      let targetIds = [...selectedUserIds];
      if (includeParent && selectedWithParent.length > 0) {
        const parentIds = selectedWithParent
          .flatMap((m) => m.parents?.map((p) => p.id) || [])
          .filter(Boolean) as string[];
        targetIds = [...new Set([...targetIds, ...parentIds])];
      }

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserIds: targetIds, teamId }),
      });
      const conv = await res.json();
      router.push(`/dashboard/messages/${conv.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "昨日";
    } else if (diffDays < 7) {
      return `${diffDays}日前`;
    }
    return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingTop: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "0 16px" }}>
        {/* ヘッダー */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-main)", margin: 0 }}>
            ✉️ メッセージ
          </h1>
          <button
            onClick={() => setShowNewDM(true)}
            style={{
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: "44px",
              height: "44px",
              fontSize: "22px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(255,71,87,0.4)",
            }}
          >
            ＋
          </button>
        </div>

        {/* 会話一覧 */}
        {!conversations ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>読み込み中...</div>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>💬</div>
            <p style={{ fontSize: "16px", marginBottom: "8px" }}>まだメッセージがありません</p>
            <p style={{ fontSize: "13px" }}>右上の「＋」からメンバーにDMを送れます</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {conversations.map((conv) => {
              const names = conv.otherParticipants.map((p) => p.name).join("、");
              const preview = conv.latestMessage
                ? (conv.latestMessage.content || "📷 画像")
                : "まだメッセージがありません";
              return (
                <div
                  key={conv.id}
                  onClick={() => router.push(`/dashboard/messages/${conv.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: conv.hasUnread ? "rgba(255,71,87,0.06)" : "var(--surface)",
                    border: conv.hasUnread ? "1px solid rgba(255,71,87,0.2)" : "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {/* アバター */}
                  <div style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--primary), #ff8c00)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    fontWeight: "800",
                    color: "#fff",
                    flexShrink: 0,
                  }}>
                    {conv.otherParticipants.length > 1 ? "👥" : names.charAt(0)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: conv.hasUnread ? "800" : "600", color: "var(--text-main)", fontSize: "14px" }}>
                        {names || "不明"}
                      </span>
                      {conv.latestMessage && (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 }}>
                          {formatTime(conv.latestMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: "13px",
                      color: conv.hasUnread ? "var(--text-main)" : "var(--text-muted)",
                      fontWeight: conv.hasUnread ? "600" : "400",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginTop: "2px",
                    }}>
                      {conv.latestMessage && conv.latestMessage.sender.id !== session?.user?.id ? "" : "あなた: "}
                      {preview}
                    </div>
                  </div>

                  {conv.hasUnread && (
                    <div style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background: "var(--primary)",
                      flexShrink: 0,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 新規DM モーダル */}
        {showNewDM && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }} onClick={() => setShowNewDM(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--surface)",
                borderRadius: "20px 20px 0 0",
                padding: "24px 20px",
                width: "100%",
                maxWidth: "600px",
                maxHeight: "80vh",
                overflowY: "auto",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main)", marginBottom: "20px" }}>
                新規メッセージ
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
                送りたいメンバーを選択してください
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                {members
                  .filter((m) => m.id !== session?.user?.id)
                  .map((member) => (
                    <div
                      key={member.id}
                      onClick={() => handleSelectUser(member.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px",
                        borderRadius: "10px",
                        background: selectedUserIds.includes(member.id) ? "rgba(255,71,87,0.1)" : "var(--bg)",
                        border: selectedUserIds.includes(member.id) ? "1px solid var(--primary)" : "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, var(--primary), #ff8c00)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: "800",
                        fontSize: "14px",
                        flexShrink: 0,
                      }}>
                        {member.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "600", color: "var(--text-main)", fontSize: "14px" }}>{member.name}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {member.role === "MANAGER" ? "指導者" : "選手"}
                          {member.parents && member.parents.length > 0 && " 👨‍👧 親アカウントあり"}
                        </div>
                      </div>
                      {selectedUserIds.includes(member.id) && (
                        <span style={{ color: "var(--primary)", fontSize: "18px" }}>✓</span>
                      )}
                    </div>
                  ))}
              </div>

              {/* 親アカウントを含めるオプション */}
              {selectedWithParent.length > 0 && (
                <div
                  onClick={() => setIncludeParent(!includeParent)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "10px",
                    background: includeParent ? "rgba(255,71,87,0.1)" : "var(--bg)",
                    border: includeParent ? "1px solid var(--primary)" : "1px solid var(--border)",
                    cursor: "pointer",
                    marginBottom: "16px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>👨‍👧</span>
                  <div>
                    <div style={{ fontWeight: "600", color: "var(--text-main)", fontSize: "13px" }}>
                      保護者（親アカウント）も会話に含める
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      3人部屋になります。進路相談など保護者が同席する場合に選択
                    </div>
                  </div>
                  {includeParent && <span style={{ marginLeft: "auto", color: "var(--primary)" }}>✓</span>}
                </div>
              )}

              <button
                onClick={handleStartDM}
                disabled={selectedUserIds.length === 0 || creating}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: selectedUserIds.length > 0 ? "var(--primary)" : "var(--border)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: "700",
                  cursor: selectedUserIds.length > 0 ? "pointer" : "not-allowed",
                }}
              >
                {creating ? "作成中..." : "メッセージを開始"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
