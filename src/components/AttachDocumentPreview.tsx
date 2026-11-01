"use client";

import { DocumentField } from "./AttachDocumentFieldEditor";

// 入団申込書・誓約書等の作成画面(/attach/documents/[id])から、実際に回答者に見える画面(/attach/d/[id])と
// 同じ見た目をその場でプレビューするための読み取り専用コンポーネント(2026-09-07追加)。
// オーナー要望: 「作ったらまず管理画面でプレビューを見て、そこから公開URLを発行する」という流れにしたい
// とのことで、公開ページ(page.tsx)の見た目をここに複製している。入力は全て無効化し、送信は行わない。
export default function AttachDocumentPreview({
  type,
  title,
  bodyText,
  fields,
  teamName,
}: {
  type: string;
  title: string;
  bodyText: string;
  fields: DocumentField[];
  teamName?: string;
}) {
  return (
    <div style={{ background: "var(--surface, #f8fafc)", borderRadius: "12px", padding: "24px 16px", border: "1px dashed var(--border)" }}>
      <div style={{ maxWidth: "440px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "18px", fontWeight: 900, background: "linear-gradient(135deg, #4f46e5, #ff8c00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            HOMEBASE
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, marginTop: "4px" }}>
            {teamName ? `${teamName} ` : ""}{title || "(タイトル未入力)"}
          </div>
        </div>

        {bodyText && (
          <div className="card" style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.8, marginBottom: "12px" }}>
            {bodyText}
          </div>
        )}

        {fields.length > 0 && (
          <div className="card" style={{ marginBottom: "12px" }}>
            {fields.map((field) => (
              <div className="form-group" key={field.id}>
                <label className="form-label">{field.label}{field.required && " *"}</label>
                {field.type === "textarea" && <textarea className="form-control" rows={3} style={{ resize: "vertical" }} disabled />}
                {field.type === "date" && <input type="date" className="form-control" disabled />}
                {field.type === "checkbox" && (
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                    <input type="checkbox" disabled /> はい
                  </label>
                )}
                {field.type === "select" && (
                  <select className="form-control" disabled>
                    <option value="">選択してください</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {field.type === "text" && <input className="form-control" disabled />}
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ marginBottom: "12px" }}>
          <div className="form-group">
            <label className="form-label">お名前 *</label>
            <input className="form-control" disabled placeholder="(回答者が入力します)" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">連絡先(電話・メールなど)</label>
            <input className="form-control" disabled placeholder="(回答者が入力します)" />
          </div>
        </div>

        {type === "PLEDGE" && (
          <div className="card" style={{ marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", lineHeight: 1.6 }}>
              <input type="checkbox" disabled style={{ marginTop: "3px" }} />
              上記の内容に同意します。
            </label>
          </div>
        )}

        <button type="button" className="btn btn-primary" disabled style={{ width: "100%", padding: "14px", fontSize: "15px", fontWeight: 700, opacity: 0.6 }}>
          送信する
        </button>
      </div>
    </div>
  );
}
