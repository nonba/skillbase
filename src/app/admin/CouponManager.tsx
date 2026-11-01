"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CouponTeam {
  id: string;
  name: string;
}
interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  durationMonths: number | null;
  description: string | null;
  active: boolean;
  expiresAt: string | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  fullyExempt: boolean;
  teams: CouponTeam[];
}

function discountLabel(c: Coupon): string {
  const pct = c.discountPercent === 100
    ? (c.fullyExempt ? "完全免除(登録不要)" : "無料(ベースのみ)")
    : `${c.discountPercent}%オフ(ベースのみ)`;
  const dur = c.durationMonths ? `${c.durationMonths}ヶ月間` : "ずっと";
  return `${dur}${pct}`;
}

export default function CouponManager({ coupons }: { coupons: Coupon[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("100");
  const [durationMonths, setDurationMonths] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [fullyExempt, setFullyExempt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setEditingId(null);
    setCode("");
    setDiscountPercent("100");
    setDurationMonths("");
    setDescription("");
    setExpiresAt("");
    setMaxRedemptions("");
    setFullyExempt(false);
    setError("");
  };

  const startEdit = (c: Coupon) => {
    setEditingId(c.id);
    setCode(c.code);
    setDiscountPercent(String(c.discountPercent));
    setDurationMonths(c.durationMonths ? String(c.durationMonths) : "");
    setDescription(c.description || "");
    setExpiresAt(c.expiresAt ? c.expiresAt.slice(0, 10) : "");
    setMaxRedemptions(c.maxRedemptions ? String(c.maxRedemptions) : "");
    setFullyExempt(c.fullyExempt);
    setError("");
    setOpen(true);
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          code,
          discountPercent,
          durationMonths: durationMonths || null,
          description: description || null,
          expiresAt: expiresAt || null,
          maxRedemptions: maxRedemptions || null,
          fullyExempt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存に失敗しました");
      } else {
        resetForm();
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (c: Coupon) => {
    const warn = c.teams.length > 0
      ? `「${c.code}」を削除します。適用中の${c.teams.length}チームからは割引が外れます。よろしいですか？`
      : `「${c.code}」を削除します。よろしいですか？`;
    if (!confirm(warn)) return;
    await fetch(`/api/admin/coupons?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
    router.refresh();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch("/api/admin/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    router.refresh();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--background)",
    color: "var(--text-main)",
    fontSize: "14px",
  };
  const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px", display: "block" };

  return (
    <div className="card card-glass" style={{ marginBottom: "40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>🎟️ クーポン管理</h2>
        <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: "14px" }} onClick={() => { resetForm(); setOpen(!open); }}>
          {open ? "閉じる" : "＋ クーポン発行"}
        </button>
      </div>

      {open && (
        <div style={{ background: "var(--surface-hover)", borderRadius: "12px", padding: "20px", marginBottom: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
          <div>
            <label style={labelStyle}>クーポンコード（配布用）</label>
            <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TOYOKAWA2026" />
          </div>
          <div>
            <label style={labelStyle}>割引率 %（ベースプランのみに適用）</label>
            {/* 会費Pay側に金額固定の割引コースを100%/30%/10%の3パターンしか用意していないため、
                それ以外の値を入力できないようにする(入力しても割引が反映されないため)。
                いずれもベースプランのみが対象(スコア/ストレージオプションは通常課金)。
                会費Pay登録自体を不要にしたい場合は下の「完全免除」チェックを使う。 */}
            <select
              style={inputStyle}
              value={discountPercent}
              onChange={(e) => {
                setDiscountPercent(e.target.value);
                if (e.target.value !== "100") setFullyExempt(false);
              }}
            >
              <option value="100">100%オフ</option>
              <option value="30">30%オフ</option>
              <option value="10">10%オフ</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>適用期間（月／空欄=ずっと）</label>
            <input style={inputStyle} type="number" min={1} value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} placeholder="3" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "10px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: discountPercent === "100" ? "pointer" : "not-allowed", opacity: discountPercent === "100" ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={fullyExempt}
                disabled={discountPercent !== "100"}
                onChange={(e) => setFullyExempt(e.target.checked)}
              />
              完全免除（会費Pay登録自体を不要にする。審査用アカウント等）
            </label>
          </div>
          <div>
            <label style={labelStyle}>説明（任意）</label>
            <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="紹介キャンペーン" />
          </div>
          <div>
            <label style={labelStyle}>コード有効期限（任意）</label>
            <input style={inputStyle} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>使用上限（任意／空欄=無制限）</label>
            <input style={inputStyle} type="number" min={1} value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="10" />
          </div>
          {editingId && (
            <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "var(--text-muted)" }}>
              ✏️ 編集中（配布済みのコードを変えると、既存カードのコードは無効になるので注意）
            </div>
          )}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "12px" }}>
            <button className="btn btn-primary" style={{ padding: "10px 24px" }} onClick={submit} disabled={loading}>
              {loading ? "保存中..." : editingId ? "変更を保存" : "発行する"}
            </button>
            {editingId && (
              <button className="btn btn-secondary" style={{ padding: "10px 20px" }} onClick={() => { resetForm(); setOpen(false); }} disabled={loading}>
                キャンセル
              </button>
            )}
            {error && <span style={{ color: "var(--danger)", fontSize: "13px", fontWeight: 600 }}>{error}</span>}
          </div>
        </div>
      )}

      {coupons.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: "8px 0" }}>まだクーポンはありません。「＋ クーポン発行」から作成できます。</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "760px" }}>
            <thead>
              <tr style={{ background: "var(--surface-hover)", borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: "12px", fontWeight: 700 }}>コード</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>内容</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>使用状況</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>適用中のチーム</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>状態</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px", fontWeight: 800, fontFamily: "monospace" }}>{c.code}</td>
                  <td style={{ padding: "12px" }}>
                    <span className="badge badge-primary">{discountLabel(c)}</span>
                    {c.description && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{c.description}</div>}
                    {c.expiresAt && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>期限: {new Date(c.expiresAt).toLocaleDateString("ja-JP")}</div>}
                  </td>
                  <td style={{ padding: "12px", fontSize: "14px" }}>
                    {c.timesRedeemed}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""} 件
                  </td>
                  <td style={{ padding: "12px", fontSize: "13px" }}>
                    {c.teams.length === 0 ? (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    ) : (
                      c.teams.map((t) => t.name).join("、 ")
                    )}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <button
                      onClick={() => toggleActive(c.id, !c.active)}
                      className={`badge ${c.active ? "badge-success" : "badge-secondary"}`}
                      style={{ border: "none", cursor: "pointer" }}
                    >
                      {c.active ? "有効" : "無効"}
                    </button>
                  </td>
                  <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => startEdit(c)}
                      className="btn btn-secondary"
                      style={{ padding: "5px 12px", fontSize: "13px", marginRight: "6px" }}
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="btn"
                      style={{ padding: "5px 12px", fontSize: "13px", background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)" }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
