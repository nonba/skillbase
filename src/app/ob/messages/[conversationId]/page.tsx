"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface Message {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
  sender: { id: string; name: string };
}

interface Participant {
  id: string;
  name: string;
  role: string;
}

interface ConversationData {
  messages: Message[];
  participants: Participant[];
}

export default function ObConversationPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const conversationId = params?.conversationId as string;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: convData, mutate } = useSWR<ConversationData>(
    conversationId ? `/api/messages/${conversationId}` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  const messages = convData?.messages;
  const participants = convData?.participants;
  const opponent = participants?.find((p) => p.id !== session?.user?.id);

  useEffect(() => {
    if (messages) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim() }),
      });
      if (res.ok) {
        setText("");
        mutate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingTop: "16px" }}>
      <button
        onClick={() => router.push("/ob")}
        style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "13px", cursor: "pointer", padding: 0, marginBottom: "12px", textAlign: "left" }}
      >
        ← OBページに戻る
      </button>

      <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "12px" }}>
        {opponent ? `${opponent.name} 先生` : "指導者"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", minHeight: "300px" }}>
        {!messages ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>読み込み中...</p>
        ) : messages.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>最初のメッセージを送ってみましょう。</p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender.id === session?.user?.id;
            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: isMine ? "row-reverse" : "row", gap: "8px" }}>
                <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: "4px" }}>
                  {!isMine && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{msg.sender.name}</span>}
                  <div style={{
                    background: isMine ? "var(--primary)" : "var(--surface)",
                    color: isMine ? "#fff" : "var(--text-main)",
                    padding: "10px 14px",
                    borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    fontSize: "14px",
                    lineHeight: 1.5,
                    border: isMine ? "none" : "1px solid var(--border)",
                    wordBreak: "break-word",
                  }}>
                    {msg.content}
                  </div>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: "10px", marginTop: "16px", position: "sticky", bottom: "16px" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="メッセージを入力..."
          rows={1}
          style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "20px", padding: "10px 16px", color: "var(--text-main)", fontSize: "14px", resize: "none", outline: "none", maxHeight: "120px" }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          style={{ background: text.trim() ? "var(--primary)" : "var(--border)", color: "#fff", border: "none", borderRadius: "50%", width: "40px", height: "40px", fontSize: "16px", cursor: text.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}
        >
          {sending ? "…" : "➤"}
        </button>
      </div>
    </div>
  );
}
