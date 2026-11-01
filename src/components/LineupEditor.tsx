"use client";

import { useState, useEffect } from "react";

type LineupItem = {
  id: string;
  order: number;
  userId: string;
  position: string;
  role: string;
};

interface LineupEditorProps {
  eventId: string;
  gameNumber: number | string;
  members: any[];
  initialLineups: any[];
  onSaved?: () => void;
  initialBattingFirst?: boolean;
}

export default function LineupEditor({ eventId, gameNumber, members, initialLineups, onSaved, initialBattingFirst }: LineupEditorProps) {
  const [lineup, setLineup] = useState<LineupItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [battingFirst, setBattingFirst] = useState(initialBattingFirst ?? true);

  useEffect(() => {
    if (typeof initialBattingFirst === "boolean") setBattingFirst(initialBattingFirst);
  }, [initialBattingFirst]);

  useEffect(() => {
    if (initialLineups && initialLineups.length > 0) {
      const myLineup = initialLineups.filter((l: any) => l.teamType === "MY");
      if (myLineup.length > 0) {
        setLineup(myLineup.map((l: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          order: l.battingOrder,
          userId: l.userId || "",
          position: l.position || "",
          role: l.role || "STARTER"
        })));
        return;
      }
    }
    
    setLineup(Array.from({ length: 9 }, (_, i) => ({
      id: Math.random().toString(36).substr(2, 9),
      order: i + 1,
      userId: "",
      position: "",
      role: "STARTER"
    })));
  }, [initialLineups]);

  const handleLineupChange = (id: string, field: keyof LineupItem, value: any) => {
    setLineup(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const addBenchPlayer = () => {
    setLineup(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      order: 0,
      userId: "",
      position: "",
      role: "BENCH"
    }]);
  };

  // DH制用: 打席に立たない投手の枠（スタメン扱いで9番の下に表示される）
  const addDhPitcher = () => {
    setLineup(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      order: 0,
      userId: "",
      position: "P",
      role: "BENCH"
    }]);
  };

  // ベンチ控え・DH投手枠の行を削除する（order:0のため打順の詰め直しは不要）
  const removeBenchPlayer = (id: string) => {
    setLineup(prev => prev.filter(l => l.id !== id));
  };

  const removeSubRow = (id: string, orderNum: number) => {
    setLineup(prev => {
      const filtered = prev.filter(l => l.id !== id);
      const orderItems = filtered.filter(l => l.order === orderNum);
      if (orderItems.length > 0) {
        const lastItem = orderItems[orderItems.length - 1];
        return filtered.map(l => l.id === lastItem.id ? { ...l, role: "STARTER" } : l);
      }
      return filtered;
    });
  };

  const saveLineup = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await fetch(`/api/schedule/${eventId}/play-by-play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameNumber: typeof gameNumber === "string" ? parseInt(gameNumber, 10) : gameNumber,
          action: "UPDATE_LINEUP",
          isMyTeamBattingFirst: battingFirst,
          lineups: lineup.map(l => ({
            battingOrder: l.order,
            userId: l.userId,
            position: l.position,
            role: l.role
          }))
        })
      });
      if (!res.ok) throw new Error("スタメンの保存に失敗しました");
      setSuccess("メンバー情報を保存しました");
      if (onSaved) onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(""), 3000);
    }
  };

  const starters = lineup.filter(l => l.order > 0).sort((a, b) => a.order - b.order);
  // DH制の投手（打順なし・ポジションP）はスタメンの一員として9番の下に表示する。控えはそれ以外
  const dhPitchers = lineup.filter(l => l.order === 0 && l.position === "P");
  const bench = lineup.filter(l => l.order === 0 && l.position !== "P");

  const selectedUserIds = lineup.map(l => l.userId).filter(id => id !== "");
  // 退場した選手（role === "SUBBED_OFF"）の守備位置は重複禁止チェックから外し、交代選手が同じポジションを選択できるようにする
  const selectedPositions = lineup.filter(l => l.role !== "SUBBED_OFF").map(l => l.position).filter(p => p !== "");

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
    { value: "P", label: "投手(打席なし)" }
  ];

  // 他の枠で割り振り済みのポジションは選択肢から除外する（重複防止）。
  // 自分の枠で選択中のものだけは表示し続ける（選び直せるように）。
  const availablePositionOptions = (own: string) =>
    positionOptions.filter(opt => opt.value === "" || opt.value === own || !selectedPositions.includes(opt.value));

  return (
    <div style={{ background: "var(--surface-hover)", padding: "20px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
      <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>📋 メンバー設定</h3>
      <p style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "16px" }}>
        💡 <strong>守備変更・途中交代のコツ:</strong><br />
        ・<strong>守備位置の変更のみ:</strong> 選手右横のポジション（ドロップダウン）を変更するだけでOKです。<br />
        ・<strong>代打・選手自体の交代:</strong> 「＋代打・交代選手を追加」を押して新しい選手を選択してください。
      </p>
      
      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary)", marginBottom: "8px" }}>先攻・後攻</h4>
        <div style={{ display: "inline-flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "4px" }}>
          <button
            type="button"
            onClick={() => setBattingFirst(true)}
            style={{ padding: "6px 14px", fontSize: "13px", fontWeight: 700, borderRadius: "6px", border: "none", cursor: "pointer", background: battingFirst ? "var(--primary)" : "transparent", color: battingFirst ? "#fff" : "var(--text-muted)" }}
          >
            自チームが先攻（表）
          </button>
          <button
            type="button"
            onClick={() => setBattingFirst(false)}
            style={{ padding: "6px 14px", fontSize: "13px", fontWeight: 700, borderRadius: "6px", border: "none", cursor: "pointer", background: !battingFirst ? "var(--primary)" : "transparent", color: !battingFirst ? "#fff" : "var(--text-muted)" }}
          >
            自チームが後攻（裏）
          </button>
        </div>
      </div>

      {error && <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", padding: "8px", borderRadius: "var(--radius-sm)", marginBottom: "12px", border: "1px solid var(--danger)", fontSize: "14px" }}>{error}</div>}
      {success && <div style={{ background: "rgba(16, 185, 129, 0.1)", color: "var(--success)", padding: "8px", borderRadius: "var(--radius-sm)", marginBottom: "12px", border: "1px solid var(--success)", fontSize: "14px" }}>{success}</div>}

      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary)", marginBottom: "8px" }}>打順・メンバー</h4>
        {Array.from({ length: 9 }, (_, i) => {
          const orderNum = i + 1;
          const items = lineup.filter(l => l.order === orderNum);
          if (items.length === 0) {
            items.push({
              id: Math.random().toString(36).substr(2, 9),
              order: orderNum,
              userId: "",
              position: "",
              role: "STARTER"
            });
          }
          return (
            <div key={orderNum} style={{ marginBottom: "10px", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {items.map((l, idx) => {
                  const isSub = idx > 0 || l.role === "SUBBED_OFF";
                  return (
                    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 800, width: "42px", fontSize: "13px", color: idx === 0 ? "var(--primary)" : "var(--text-muted)", flexShrink: 0 }}>
                        {idx === 0 ? `${orderNum}番` : "↳交代"}
                      </span>
                      <select className="form-control" style={{ flex: 2, padding: "6px", fontSize: "13px" }} value={l.userId} onChange={e => handleLineupChange(l.id, "userId", e.target.value)}>
                        <option value="">-- 選手 --</option>
                        {members.map((m: any) => {
                          // 同じ打順内であれば同一選手の再選択（守備変更の層・履歴記録）を許可
                          const isSelected = lineup.some(item => item.order !== l.order && item.order > 0 && item.userId === m.id) && m.id !== l.userId;
                          return (
                            <option key={m.id} value={m.id} disabled={isSelected}>
                              {(m.jerseyNumber ? m.jerseyNumber + " " : "") + m.name}
                            </option>
                          );
                        })}
                      </select>
                      <select className="form-control" style={{ flex: 1, padding: "6px", fontSize: "13px" }} value={l.position} onChange={e => handleLineupChange(l.id, "position", e.target.value)}>
                        {availablePositionOptions(l.position).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      {isSub && (
                        <button
                          type="button"
                          onClick={() => removeSubRow(l.id, orderNum)}
                          style={{
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid var(--danger)",
                            color: "var(--danger)",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 700,
                            padding: "4px 8px",
                            borderRadius: "6px",
                            flexShrink: 0
                          }}
                          title="この交代を取り消す（１つ前の状態に戻す）"
                        >
                          ✕ 取消
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* DH制の投手はスタメンの一員として9番の直下に表示 */}
        {dhPitchers.map(l => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontWeight: 700, width: "25px", fontSize: "13px", color: "var(--primary)" }}>投</span>
            <select className="form-control" style={{ flex: 2, padding: "6px", fontSize: "14px" }} value={l.userId} onChange={e => handleLineupChange(l.id, "userId", e.target.value)}>
              <option value="">-- 選手 --</option>
              {members.map((m: any) => {
                const isSelected = selectedUserIds.includes(m.id) && m.id !== l.userId;
                return (
                  <option key={m.id} value={m.id} disabled={isSelected}>
                    {(m.jerseyNumber ? m.jerseyNumber + " " : "") + m.name}
                  </option>
                );
              })}
            </select>
            <select className="form-control" style={{ flex: 1, padding: "6px", fontSize: "14px" }} value={l.position} onChange={e => handleLineupChange(l.id, "position", e.target.value)}>
              {availablePositionOptions(l.position).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <button onClick={() => removeBenchPlayer(l.id)} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "16px" }}>×</button>
          </div>
        ))}
        {dhPitchers.length === 0 && (
          <button className="btn btn-secondary" style={{ width: "100%", padding: "6px", fontSize: "12px", marginTop: "4px" }} onClick={addDhPitcher}>
            ＋ DH制の投手枠を追加（打席なし）
          </button>
        )}
      </div>

      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px" }}>ベンチ控え</h4>
        {bench.map(l => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ width: "20px", color: "transparent" }}>-</span>
            <select className="form-control" style={{ flex: 2, padding: "6px", fontSize: "14px" }} value={l.userId} onChange={e => handleLineupChange(l.id, "userId", e.target.value)}>
              <option value="">-- 選手 --</option>
              {members.map((m: any) => {
                const isSelected = selectedUserIds.includes(m.id) && m.id !== l.userId;
                return (
                  <option key={m.id} value={m.id} disabled={isSelected}>
                    {(m.jerseyNumber ? m.jerseyNumber + " " : "") + m.name}
                  </option>
                );
              })}
            </select>
            <select className="form-control" style={{ flex: 1, padding: "6px", fontSize: "14px" }} value={l.position} onChange={e => handleLineupChange(l.id, "position", e.target.value)}>
              {availablePositionOptions(l.position).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <button onClick={() => removeBenchPlayer(l.id)} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "16px" }}>×</button>
          </div>
        ))}
        <button className="btn btn-secondary" style={{ width: "100%", padding: "6px", fontSize: "12px", marginTop: "4px" }} onClick={addBenchPlayer}>
          ＋ 控え枠を追加
        </button>
      </div>

      <button className="btn btn-primary" style={{ width: "100%", marginTop: "12px" }} onClick={saveLineup} disabled={saving}>
        {saving ? "保存中..." : "メンバーを保存"}
      </button>
    </div>
  );
}
