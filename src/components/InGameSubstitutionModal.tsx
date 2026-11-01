"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface InGameSubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineups: any[];
  members: any[];
  eventId: string;
  gameNumber: number | string;
  onSaved: () => void;
}

export default function InGameSubstitutionModal({
  isOpen,
  onClose,
  lineups,
  members,
  eventId,
  gameNumber,
  onSaved,
}: InGameSubstitutionModalProps) {
  const [editedLineups, setEditedLineups] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const positionOptions = [
    { value: "", label: "-" },
    { value: "1", label: "1(投)" },
    { value: "2", label: "2(捕)" },
    { value: "3", label: "3(一)" },
    { value: "4", label: "4(二)" },
    { value: "5", label: "5(三)" },
    { value: "6", label: "6(遊)" },
    { value: "7", label: "7(左)" },
    { value: "8", label: "8(中)" },
    { value: "9", label: "9(右)" },
    { value: "DH", label: "DH" },
  ];

  useEffect(() => {
    if (isOpen) {
      setEditedLineups(JSON.parse(JSON.stringify(lineups)));
      setError("");
      setSuccess("");
    }
  }, [isOpen, lineups]);

  if (!isOpen) return null;

  // 各打順（1〜9）のアクティブなラインナップ（role !== "SUBBED_OFF" または 最後の要素）
  const getActiveItem = (orderNum: number) => {
    const items = editedLineups.filter((l: any) => l.battingOrder === orderNum);
    if (items.length === 0) return null;
    const active = items.find((l: any) => l.role !== "SUBBED_OFF");
    return active || items[items.length - 1];
  };

  // 選手の交代（代打）処理
  const handleUserChange = (orderNum: number, newUserId: string) => {
    setEditedLineups((prev) => {
      const items = prev.filter((l: any) => l.battingOrder === orderNum);
      if (items.length === 0) return prev;
      const lastActive = items[items.length - 1];

      if (lastActive.userId === newUserId) return prev;

      // 既存の最新選手を SUBBED_OFF にし、新しい選手行を追加
      const updated = prev.map((l: any) =>
        l.id === lastActive.id ? { ...l, role: "SUBBED_OFF" } : l
      );
      const newMember = members.find((m: any) => m.id === newUserId);
      updated.push({
        id: Math.random().toString(36).substr(2, 9),
        battingOrder: orderNum,
        userId: newUserId,
        position: lastActive.position,
        role: "STARTER",
        playerName: newMember ? newMember.name : "",
      });
      return updated;
    });
  };

  // 守備位置の変更処理
  const handlePositionChange = (orderNum: number, newPos: string) => {
    setEditedLineups((prev) => {
      const items = prev.filter((l: any) => l.battingOrder === orderNum);
      if (items.length === 0) return prev;
      const lastActive = items[items.length - 1];

      if (lastActive.position === newPos) return prev;

      // 元の位置がある場合、それまでの状態を SUBBED_OFF として残し新ポジション行を追加
      const updated = prev.map((l: any) =>
        l.id === lastActive.id ? { ...l, role: "SUBBED_OFF" } : l
      );
      updated.push({
        id: Math.random().toString(36).substr(2, 9),
        battingOrder: orderNum,
        userId: lastActive.userId,
        position: newPos,
        role: "STARTER",
        playerName: lastActive.playerName || "",
      });
      return updated;
    });
  };

  // 打順の交代履歴を1つ元に戻す
  const handleUndoOrder = (orderNum: number) => {
    setEditedLineups((prev) => {
      const items = prev.filter((l: any) => l.battingOrder === orderNum);
      if (items.length <= 1) return prev;
      const lastActive = items[items.length - 1];
      const prevActive = items[items.length - 2];

      return prev
        .filter((l: any) => l.id !== lastActive.id)
        .map((l: any) => (l.id === prevActive.id ? { ...l, role: "STARTER" } : l));
    });
  };

  // 保存処理
  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");

      const res = await fetch(`/api/schedule/${eventId}/play-by-play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameNumber: typeof gameNumber === "string" ? parseInt(gameNumber, 10) : gameNumber,
          action: "UPDATE_LINEUP",
          lineups: editedLineups.map((l: any) => ({
            battingOrder: l.battingOrder,
            userId: l.userId,
            position: l.position,
            role: l.role,
          })),
        }),
      });

      if (!res.ok) throw new Error("守備変更・交代の保存に失敗しました");

      setSuccess("守備位置・選手交代を保存しました！");
      setTimeout(() => {
        onSaved();
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.message || "保存時にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  // document.bodyへ直接描画する（ページ側の.card-glass等にbackdrop-filter/transformが
  // 掛かっていると、それが新たな「fixedの基準」になってしまい、画面中央ではなく
  // 祖先要素（縦に長いページ全体）の中央=画面よりずっと下に表示されてしまうため）
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-md)",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            padding: "16px 20px",
            background: "var(--primary)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 800, margin: 0, whiteSpace: "nowrap" }}>
              🛡️ 【試合中】守備変更・選手交代
            </h2>
            <p style={{ fontSize: "11px", margin: "2px 0 0 0", opacity: 0.9, whiteSpace: "nowrap" }}>
              スタメンをベースに、試合中の位置変更・代打をまとめて更新できます
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.2)",
              border: "none",
              color: "#fff",
              fontSize: "18px",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* コンテンツエリア */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "var(--danger)",
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                marginBottom: "12px",
                border: "1px solid var(--danger)",
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.1)",
                color: "var(--success)",
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                marginBottom: "12px",
                border: "1px solid var(--success)",
              }}
            >
              {success}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((ord) => {
              const active = getActiveItem(ord);
              const allItems = editedLineups.filter((l: any) => l.battingOrder === ord);
              const hasHistory = allItems.length > 1;

              return (
                <div
                  key={ord}
                  style={{
                    padding: "12px 14px",
                    background: "var(--surface-hover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: "14px",
                        color: "var(--primary)",
                        width: "32px",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ord}番
                    </span>

                    {/* 選手選択 */}
                    <select
                      className="form-control"
                      value={active?.userId || ""}
                      onChange={(e) => handleUserChange(ord, e.target.value)}
                      style={{ flex: 2, padding: "6px 8px", fontSize: "13px" }}
                    >
                      <option value="">-- 選手未選択 --</option>
                      {members.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {(m.jerseyNumber ? m.jerseyNumber + " " : "") + m.name}
                        </option>
                      ))}
                    </select>

                    {/* 守備位置選択 */}
                    <select
                      className="form-control"
                      value={active?.position || ""}
                      onChange={(e) => handlePositionChange(ord, e.target.value)}
                      style={{ flex: 1, padding: "6px 8px", fontSize: "13px" }}
                    >
                      {positionOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 交代履歴と戻すボタン */}
                  {hasHistory && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: "6px",
                        borderTop: "1px dashed var(--border)",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span>
                        履歴: {allItems.length}件（前位置/前選手が記録されています）
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUndoOrder(ord)}
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid var(--danger)",
                          color: "var(--danger)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ✕ 1つ前に戻す
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* フッター */}
        <div
          style={{
            padding: "14px 20px",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "10px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              fontSize: "14px",
              fontWeight: 700,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-main)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            style={{
              flex: 2,
              padding: "10px",
              fontSize: "14px",
              fontWeight: 800,
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--primary)",
              color: "#ffffff",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)",
              whiteSpace: "nowrap",
            }}
          >
            {saving ? "保存中..." : "💾 守備変更・交代を保存して試合画面へ"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
