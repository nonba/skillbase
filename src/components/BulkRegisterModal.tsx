"use client";

import { useState } from "react";
import { gradeOptions } from "@/lib/grade";

type Role = "PLAYER" | "MANAGER";

type Row = {
  name: string;
  loginId: string;
  role: Role;
  grade?: string; // "" | "0"(体験) | "1".."6"
  siblingId?: string; // 既存の兄弟(選手)ID。選ぶと親を新規作成せず引き継ぐ。
};

type CreatedAccount = {
  id: string;
  name: string;
  loginId: string;
  tempPassword: string;
  role: "PLAYER" | "MANAGER" | "PARENT";
  linkedTo?: string;
};

const emptyRow = (): Row => ({ name: "", loginId: "", role: "PLAYER" });

// 取り込みファイルの列見出しを内部フィールドに対応づける（日本語・英語どちらの見出しも許容）
function mapHeader(h: string): keyof Row | null {
  const s = String(h || "").trim().toLowerCase().replace(/\s/g, "");
  if (["名前", "氏名", "選手名", "name"].includes(s)) return "name";
  if (["ログインid", "id", "ログイン", "loginid", "ユーザーid"].includes(s)) return "loginId";
  if (["役割", "区分", "role", "種別", "立場"].includes(s)) return "role";
  if (["学年", "grade", "年", "gakunen"].includes(s)) return "grade";
  return null;
}

// 学年の表記ゆれを 0(体験)/1..6/"" に正規化
function parseGrade(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/体験|たいけん|trial/i.test(s)) return "0";
  const m = s.match(/([1-6])/); // 「小4」「4年」「4」等から数字を拾う
  return m ? m[1] : "";
}

// 役割テキスト（選手/指導者/コーチ等）を正規化
function parseRole(raw: string): Role {
  const s = String(raw || "").trim().toLowerCase();
  if (["指導者", "コーチ", "監督", "manager", "coach", "staff", "スタッフ"].includes(s)) return "MANAGER";
  return "PLAYER";
}

export default function BulkRegisterModal({
  open,
  category,
  existingPlayers = [],
  onClose,
  onCompleted,
}: {
  open: boolean;
  category?: string;
  existingPlayers?: { id: string; name: string }[];
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const gradeOpts = gradeOptions(category);
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [result, setResult] = useState<CreatedAccount[] | null>(null);
  const [copied, setCopied] = useState(false);
  // 配布リンク・QR（家族単位）
  const [distributing, setDistributing] = useState<string | null>(null); // どの家族のリンクを発行中か（selectedPlayerId or "__all__"）
  const [distributeLinks, setDistributeLinks] = useState<{ [key: string]: { url: string; qr: string } }>({});
  const [distributeError, setDistributeError] = useState("");
  const [linkCopiedFor, setLinkCopiedFor] = useState<string | null>(null);

  if (!open) return null;

  const updateRow = (i: number, key: keyof Row, value: string | boolean) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? ({ ...r, [key]: value } as Row) : r)));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const handleFile = async (file: File) => {
    setError("");
    setErrorDetails([]);
    try {
      // SheetJS はクライアント側でのみ読み込む（.xlsx / .xls / .csv を統一的に解析）
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      if (json.length === 0) {
        setError("ファイルにデータが見つかりませんでした。");
        return;
      }

      // 1行目を見出しとして解釈。対応が取れなければ「名前, ID, 背番号, ポジション」の並びとみなす
      const headerRow = json[0].map((c) => String(c ?? ""));
      const mapped = headerRow.map(mapHeader);
      const hasHeader = mapped.some((m) => m !== null);
      const dataRows = hasHeader ? json.slice(1) : json;
      const colOrder: (keyof Row)[] = hasHeader
        ? (mapped.map((m) => m ?? "__skip") as any)
        : ["name", "loginId", "role"];

      const imported: Row[] = [];
      for (const raw of dataRows) {
        if (!raw || raw.every((c) => String(c ?? "").trim() === "")) continue;
        const row = emptyRow();
        colOrder.forEach((field, idx) => {
          if (field === ("__skip" as any)) return;
          const val = String(raw[idx] ?? "").trim();
          if (!val) return;
          if (field === "role") row.role = parseRole(val);
          else if (field === "grade") row.grade = parseGrade(val);
          else (row as any)[field] = val;
        });
        if (row.name || row.loginId) imported.push(row);
      }

      if (imported.length === 0) {
        setError("有効な行が見つかりませんでした。テンプレートの形式をご確認ください。");
        return;
      }
      setRows(imported);
    } catch (e: any) {
      setError("ファイルの読み込みに失敗しました：" + String(e?.message || e));
    }
  };

  const downloadTemplate = () => {
    const csv = "﻿名前,ログインID,役割,学年\n山田太郎,yamada,選手,4\n鈴木一郎,suzuki,選手,6\n佐藤監督,sato,指導者,\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skillbase_選手一括登録テンプレート.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    setError("");
    setErrorDetails([]);
    const players = rows
      .filter((r) => r.name.trim() || r.loginId.trim())
      .map((r) => ({
        name: r.name.trim(),
        loginId: r.loginId.trim(),
        role: r.role,
        grade: r.role === "PLAYER" && r.grade ? Number(r.grade) : undefined,
        siblingId: r.role === "PLAYER" && r.siblingId ? r.siblingId : undefined,
      }));

    if (players.length === 0) {
      setError("登録するメンバーを1人以上入力してください。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登録に失敗しました。");
        setErrorDetails(Array.isArray(data.details) ? data.details : []);
        return;
      }
      setResult(data.accounts as CreatedAccount[]);
      onCompleted?.();
    } catch (e: any) {
      setError("通信エラーが発生しました：" + String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = (r: CreatedAccount["role"]) => (r === "PLAYER" ? "選手" : r === "MANAGER" ? "指導者" : "保護者");

  const copyAll = async () => {
    if (!result) return;
    const lines = result.map(
      (a) => `${roleLabel(a.role)}\t${a.name}\tID: ${a.loginId}\t仮パスワード: ${a.tempPassword}`
    );
    const text = "SKILLBASE ログイン情報一覧\n" + lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  };

  const downloadCsv = () => {
    if (!result) return;
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = "役割,名前,ログインID,仮パスワード,紐づく選手\n";
    const body = result
      .map((a) => [roleLabel(a.role), a.name, a.loginId, a.tempPassword, a.linkedTo || ""].map(esc).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `skillbase_ログイン情報_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 家族単位（選手＋その保護者）にグルーピング。指導者は単独グループ。
  const familyGroups = (() => {
    if (!result) return [];
    const players = result.filter((a) => a.role === "PLAYER");
    const managers = result.filter((a) => a.role === "MANAGER");
    const groups: { key: string; label: string; accounts: CreatedAccount[] }[] = players.map((p) => ({
      key: p.id,
      label: p.name,
      accounts: [p, ...result.filter((a) => a.role === "PARENT" && a.linkedTo === p.name)],
    }));
    managers.forEach((m) => groups.push({ key: m.id, label: `${m.name}（指導者）`, accounts: [m] }));
    return groups;
  })();

  const issueDistributeLink = async (key: string, accounts: CreatedAccount[]) => {
    setDistributeError("");
    setDistributing(key);
    try {
      const res = await fetch("/api/family-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts: accounts.map((a) => ({ userId: a.id, name: a.name, role: a.role, loginId: a.loginId, tempPassword: a.tempPassword })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "配布リンクの作成に失敗しました。");
      const url = `${window.location.origin}/family/${data.token}`;
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      setDistributeLinks((prev) => ({ ...prev, [key]: { url, qr } }));
    } catch (e: any) {
      setDistributeError(e.message || "通信エラーが発生しました。");
    } finally {
      setDistributing(null);
    }
  };

  const copyLink = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiedFor(key);
      setTimeout(() => setLinkCopiedFor(null), 2000);
    } catch {}
  };

  const closeAll = () => {
    setRows([emptyRow(), emptyRow(), emptyRow()]);
    setResult(null);
    setError("");
    setErrorDetails([]);
    onClose();
  };

  return (
    <div style={overlay} onClick={closeAll}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* ===== 登録完了：認証情報リスト ===== */}
        {result ? (
          <>
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>✅ 登録が完了しました</h2>
            <div style={{ margin: "0 0 14px", fontSize: 13, color: "#92400e", lineHeight: 1.6, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "10px 12px" }}>
              ⚠️ <strong>仮パスワードはこの画面でしか確認できません。</strong>必ず下の「保存」か「コピー」で控えを取ってください。もし控え忘れても、あとから名簿画面で<strong>仮パスワードの再発行</strong>ができます（初回ログイン時に本人がパスワードを変更します）。
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={downloadCsv} style={primaryBtn}>
                💾 CSVで保存
              </button>
              <button onClick={copyAll} style={{ ...primaryBtn, background: "#fff", color: "#4f46e5", border: "1px solid #c7d2fe" }}>
                {copied ? "コピーしました！" : "📋 コピー"}
              </button>
            </div>
            <div style={{ maxHeight: "45vh", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              {result.map((a, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 14px",
                    borderBottom: i < result.length - 1 ? "1px solid #f1f5f9" : "none",
                    background: a.role === "PARENT" ? "#f8fafc" : "#fff",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>
                    {a.role === "PLAYER" ? "⚾ 選手" : a.role === "MANAGER" ? "📋 指導者" : `👪 保護者（${a.linkedTo}）`}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    ID: <code style={code}>{a.loginId}</code>　仮パス: <code style={code}>{a.tempPassword}</code>
                  </div>
                </div>
              ))}
            </div>
            <h3 style={{ margin: "20px 0 8px", fontSize: 15, fontWeight: 800 }}>📤 ご家族に配布する</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              家族ごとに配布用リンク・QRコードを発行できます。開くとその家族のID・仮パスワードだけが見られるページになります（30日間有効）。
            </p>
            {distributeError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>
                {distributeError}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {familyGroups.map((fg) => {
                const link = distributeLinks[fg.key];
                return (
                  <div key={fg.key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {fg.accounts[0].role === "PLAYER" ? "⚾" : "📋"} {fg.label}
                        {fg.accounts.length > 1 && <span style={{ color: "#94a3b8", fontWeight: 500 }}>{` + 保護者${fg.accounts.length - 1}名`}</span>}
                      </div>
                      {!link && (
                        <button
                          onClick={() => issueDistributeLink(fg.key, fg.accounts)}
                          disabled={distributing === fg.key}
                          style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}
                        >
                          {distributing === fg.key ? "発行中..." : "リンク・QRを発行"}
                        </button>
                      )}
                    </div>
                    {link && (
                      <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={link.qr} alt="QRコード" style={{ width: 110, height: 110, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>共有リンク</div>
                          <div style={{ fontSize: 12, wordBreak: "break-all", background: "#f8fafc", padding: "6px 8px", borderRadius: 6, marginBottom: 6 }}>{link.url}</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => copyLink(fg.key, link.url)} style={{ ...primaryBtn, background: "#fff", color: "#4f46e5", border: "1px solid #c7d2fe", padding: "5px 12px", fontSize: 12 }}>
                              {linkCopiedFor === fg.key ? "コピーしました！" : "🔗 リンクをコピー"}
                            </button>
                            <a href={`${link.url}/print`} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, background: "#fff", color: "#4f46e5", border: "1px solid #c7d2fe", padding: "5px 12px", fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                              🖨️ 印刷用シート
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={closeAll} style={primaryBtn}>
                閉じる
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ===== 入力：手入力テーブル＋ファイル取り込み ===== */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>選手をまとめて登録</h2>
              <button onClick={closeAll} style={closeBtn}>
                ✕
              </button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              下の表に直接入力するか、Excel / CSVファイルを取り込めます。役割で<strong>選手</strong>を選ぶと<strong>保護者アカウントが2つ自動で作られます</strong>（指導者は本人のみ）。すでにチームにいる<strong>兄弟</strong>を選ぶと、保護者は新規作成せず<strong>その兄弟の保護者を引き継いで紐付け</strong>ます。ID・仮パスは登録後に一覧表示されます。
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <label style={secondaryBtn}>
                📁 Excel/CSVを取り込む
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button onClick={downloadTemplate} style={ghostBtn}>
                ⬇ テンプレートをダウンロード
              </button>
            </div>

            <div style={{ maxHeight: "40vh", overflowY: "auto", overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: existingPlayers.length > 0 ? 560 : 420 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    <th style={th}>名前 *</th>
                    <th style={th}>ログインID *</th>
                    <th style={{ ...th, width: 100 }}>役割 *</th>
                    <th style={{ ...th, width: 90 }}>学年</th>
                    {existingPlayers.length > 0 && <th style={{ ...th, width: 130 }}>兄弟</th>}
                    <th style={{ ...th, width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={td}>
                        <input style={cell} value={r.name} placeholder="山田太郎" onChange={(e) => updateRow(i, "name", e.target.value)} />
                      </td>
                      <td style={td}>
                        <input style={cell} value={r.loginId} placeholder="yamada" onChange={(e) => updateRow(i, "loginId", e.target.value)} />
                      </td>
                      <td style={td}>
                        <select style={cell} value={r.role} onChange={(e) => updateRow(i, "role", e.target.value as Role)}>
                          <option value="PLAYER">選手</option>
                          <option value="MANAGER">指導者</option>
                        </select>
                      </td>
                      <td style={td}>
                        {r.role === "PLAYER" ? (
                          <select style={cell} value={r.grade ?? ""} onChange={(e) => updateRow(i, "grade", e.target.value)}>
                            <option value="">—</option>
                            {gradeOpts.map((o) => (
                              <option key={o.value} value={String(o.value)}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>
                        )}
                      </td>
                      {existingPlayers.length > 0 && (
                        <td style={td}>
                          {r.role === "PLAYER" ? (
                            <select style={cell} value={r.siblingId ?? ""} onChange={(e) => updateRow(i, "siblingId", e.target.value)} title="チーム内に兄弟がいる場合に選択。保護者はその兄弟から引き継ぎます。">
                              <option value="">なし</option>
                              {existingPlayers.map((pl) => (
                                <option key={pl.id} value={pl.id}>{pl.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ ...td, textAlign: "center" }}>
                        <button onClick={() => removeRow(i)} style={rowDel} title="この行を削除">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addRow} style={{ ...ghostBtn, marginTop: 8 }}>
              ＋ 行を追加
            </button>

            <p style={{ fontSize: 12, color: "#94a3b8", margin: "10px 0 0", lineHeight: 1.6 }}>
              ※ ログインIDには自動でチームコードが付きます（例: 入力「yamada」→ 実際のID「st001_yamada」）。英数字・_・- が使えます。
            </p>

            {error && (
              <div style={errBox}>
                <div style={{ fontWeight: 700 }}>{error}</div>
                {errorDetails.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {errorDetails.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={closeAll} style={ghostBtn}>
                キャンセル
              </button>
              <button onClick={handleSubmit} disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.6 : 1 }}>
                {loading ? "登録中..." : "この内容で登録する"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
  padding: 16,
};
const modal: React.CSSProperties = {
  background: "#fff",
  color: "#0f172a",
  borderRadius: 16,
  padding: 22,
  width: "100%",
  maxWidth: 620,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "#475569", fontWeight: 700, borderBottom: "1px solid #e2e8f0" };
const td: React.CSSProperties = { padding: "4px 6px", borderBottom: "1px solid #f1f5f9" };
const cell: React.CSSProperties = { width: "100%", padding: "7px 8px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { flex: 1, padding: "12px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "9px 14px", background: "#eef2ff", color: "#4f46e5", border: "1px solid #c7d2fe", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "9px 14px", background: "#fff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const closeBtn: React.CSSProperties = { background: "transparent", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer" };
const rowDel: React.CSSProperties = { background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13 };
const code: React.CSSProperties = { background: "#f1f5f9", padding: "1px 6px", borderRadius: 5, fontFamily: "monospace", fontSize: 13 };
const errBox: React.CSSProperties = { marginTop: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, color: "#b91c1c", fontSize: 13 };
