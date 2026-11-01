"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { getPusherClient } from "@/lib/pusher";
import CallOverlay from "@/components/CallOverlay";

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

export default function ConversationPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const conversationId = params?.conversationId as string;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 通話ステート (発信専用)
  const [activeCall, setActiveCall] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("audio");

  const { data: convData, mutate } = useSWR<ConversationData>(
    conversationId ? `/api/messages/${conversationId}` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  const messages = convData?.messages;
  const participants = convData?.participants;
  const opponent = participants?.find((p) => p.id !== session?.user?.id);

  const handleInitiateCall = (type: "audio" | "video") => {
    setCallType(type);
    setActiveCall(true);
  };

  // メッセージが更新されたら一番下にスクロール
  useEffect(() => {
    if (messages) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSend = async () => {
    if ((!text.trim() && !imageFile) || sending) return;
    setSending(true);

    try {
      let uploadedImageUrl: string | null = null;

      // 画像がある場合は先にアップロード
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        const uploadRes = await fetch("/api/upload/r2", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedImageUrl = uploadData.url;
        }
      }

      const res = await fetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text.trim(),
          imageUrl: uploadedImageUrl,
        }),
      });

      if (res.ok) {
        setText("");
        setImageFile(null);
        setImagePreview(null);
        mutate();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
  };

  // メッセージを日付でグループ化
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  if (messages) {
    messages.forEach((msg) => {
      const dateLabel = formatDate(msg.createdAt);
      const lastGroup = groupedMessages[groupedMessages.length - 1];
      if (lastGroup && lastGroup.date === dateLabel) {
        lastGroup.messages.push(msg);
      } else {
        groupedMessages.push({ date: dateLabel, messages: [msg] });
      }
    });
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100dvh",
      background: "var(--bg)",
    }}>
      {/* ヘッダー */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 16px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <button
          onClick={() => router.push("/dashboard/messages")}
          style={{
            background: "none",
            border: "none",
            color: "var(--primary)",
            fontSize: "18px",
            cursor: "pointer",
            padding: "4px",
          }}
        >
          ←
        </button>
        <div style={{
          width: "38px",
          height: "38px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--primary), #ff8c00)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: "800",
          fontSize: "15px",
        }}>
          ✉️
        </div>
        <div>
          <div style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>
            {opponent ? opponent.name : "チームメッセージ"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {opponent ? `${opponent.role === "MANAGER" ? "指導者" : opponent.role === "PARENT" ? "保護者" : "選手"}` : "メッセージ"}
          </div>
        </div>

        {/* 通話開始ボタン */}
        {opponent && (
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            <button
              onClick={() => handleInitiateCall("audio")}
              style={{
                background: "rgba(255, 71, 87, 0.1)",
                color: "var(--primary)",
                border: "1px solid var(--primary)",
                borderRadius: "20px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              📞 通話
            </button>
            <button
              onClick={() => handleInitiateCall("video")}
              style={{
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                borderRadius: "20px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                boxShadow: "0 4px 10px rgba(255, 71, 87, 0.2)"
              }}
            >
              📹 ビデオ
            </button>
          </div>
        )}
      </div>

      {/* メッセージエリア */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {!messages ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>読み込み中...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
            <p>最初のメッセージを送ってみましょう！</p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              {/* 日付セパレーター */}
              <div style={{
                textAlign: "center",
                margin: "16px 0 12px",
                position: "relative",
              }}>
                <span style={{
                  background: "var(--surface)",
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  border: "1px solid var(--border)",
                }}>
                  {group.date}
                </span>
              </div>

              {group.messages.map((msg) => {
                const isMyMessage = msg.sender.id === session?.user?.id;
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: isMyMessage ? "row-reverse" : "row",
                      alignItems: "flex-end",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    {/* 相手のアバター */}
                    {!isMyMessage && (
                      <div style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #667eea, #764ba2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: "800",
                        fontSize: "12px",
                        flexShrink: 0,
                      }}>
                        {msg.sender.name.charAt(0)}
                      </div>
                    )}

                    <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isMyMessage ? "flex-end" : "flex-start", gap: "4px" }}>
                      {!isMyMessage && (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px" }}>
                          {msg.sender.name}
                        </span>
                      )}
                      {/* 吹き出し */}
                      <div style={{
                        background: isMyMessage ? "var(--primary)" : "var(--surface)",
                        color: isMyMessage ? "#fff" : "var(--text-main)",
                        padding: msg.imageUrl && !msg.content ? "4px" : "10px 14px",
                        borderRadius: isMyMessage ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        fontSize: "14px",
                        lineHeight: "1.5",
                        border: isMyMessage ? "none" : "1px solid var(--border)",
                        wordBreak: "break-word",
                      }}>
                        {msg.imageUrl && (
                          <img
                            src={msg.imageUrl}
                            alt="添付画像"
                            style={{
                              maxWidth: "200px",
                              maxHeight: "200px",
                              borderRadius: "12px",
                              display: "block",
                              cursor: "pointer",
                            }}
                            onClick={() => window.open(msg.imageUrl!, "_blank")}
                          />
                        )}
                        {msg.content && <span>{msg.content}</span>}
                      </div>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 画像プレビュー */}
      {imagePreview && (
        <div style={{
          padding: "8px 16px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <img src={imagePreview} alt="プレビュー" style={{ height: "60px", borderRadius: "8px" }} />
          <button
            onClick={() => { setImageFile(null); setImagePreview(null); }}
            style={{ background: "var(--border)", border: "none", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer", color: "var(--text-main)", fontSize: "12px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 入力エリア */}
      <div style={{
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        {/* 画像添付ボタン */}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            fontSize: "18px",
            cursor: "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          📷
        </button>

        {/* テキスト入力 */}
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
          style={{
            flex: 1,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            padding: "10px 16px",
            color: "var(--text-main)",
            fontSize: "14px",
            resize: "none",
            outline: "none",
            lineHeight: "1.4",
            maxHeight: "120px",
            overflowY: "auto",
          }}
        />

        {/* 送信ボタン */}
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !imageFile) || sending}
          style={{
            background: text.trim() || imageFile ? "var(--primary)" : "var(--border)",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            fontSize: "16px",
            cursor: text.trim() || imageFile ? "pointer" : "not-allowed",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
        >
          {sending ? "…" : "➤"}
        </button>
      </div>

      {/* 通話機能のオーバーレイ画面 */}
      {activeCall && opponent && session?.user && (
        <CallOverlay
          conversationId={conversationId}
          currentUserId={session.user.id}
          currentUserName={session.user.name || "自分"}
          opponentId={opponent.id}
          opponentName={opponent.name}
          incomingSignal={null}
          initialCallType={callType}
          onClose={() => {
            setActiveCall(false);
          }}
        />
      )}
    </div>
  );
}
