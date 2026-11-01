"use client";

export type DocumentField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "date" | "checkbox" | "select";
  required: boolean;
  options?: string[] | null;
  // 申込書(type="APPLICATION")の項目のみ使用。選手アカウント発行に必要な情報とこの項目を
  // 対応付ける(SYSTEM_FIELD_OPTIONSのvalueのいずれか、対応なしはnull)。2026-09-08追加、
  // 「申込書の回答から選手リスト・アカウント発行・団費計算まで自動でつなげたい」という
  // オーナー要望への対応(承認処理はplayerAccount.tsのcreatePlayerAccountWithFamilyへ渡す)。
  mapsTo?: string | null;
};

const TYPE_LABELS: Record<DocumentField["type"], string> = {
  text: "1行入力",
  textarea: "複数行入力",
  date: "日付",
  checkbox: "チェック",
  select: "選択肢",
};

export const SYSTEM_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "playerName", label: "選手氏名" },
  { value: "playerNameKana", label: "選手氏名(ふりがな)" },
  { value: "birthDate", label: "生年月日" },
  { value: "grade", label: "学年" },
  { value: "schoolName", label: "学校名" },
  { value: "guardianName", label: "保護者氏名" },
  { value: "guardianRelation", label: "保護者続柄" },
  { value: "guardianPhone", label: "保護者電話番号" },
  { value: "guardianEmail", label: "保護者メールアドレス" },
  { value: "address", label: "住所" },
  { value: "healthNotes", label: "特に注意を要する事項" },
];

function makeFieldId() {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 「申込書作成/誓約書作成/その他資料作成」の項目一覧を編集するコンポーネント。
// AI抽出結果の下書き編集にも、ゼロからの手動作成にも使う。
// showSystemMapping: 申込書(APPLICATION)の時だけtrueにして、各項目に選手アカウント発行用の
// システム項目を対応付けられるようにする。
export default function AttachDocumentFieldEditor({
  fields,
  onChange,
  disabled,
  showSystemMapping,
}: {
  fields: DocumentField[];
  onChange: (fields: DocumentField[]) => void;
  disabled?: boolean;
  showSystemMapping?: boolean;
}) {
  const updateField = (id: string, patch: Partial<DocumentField>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
  };

  const moveField = (id: string, direction: -1 | 1) => {
    const index = fields.findIndex((f) => f.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= fields.length) return;
    const next = [...fields];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  };

  const addField = () => {
    onChange([...fields, { id: makeFieldId(), label: "", type: "text", required: false, options: null, mapsTo: null }]);
  };

  const usedMappings = new Set(fields.map((f) => f.mapsTo).filter(Boolean));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {fields.length === 0 && (
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>まだ項目がありません。</p>
      )}
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="card"
          style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="form-control"
              style={{ flex: "1 1 200px" }}
              placeholder="項目名(例: 選手氏名)"
              value={field.label}
              disabled={disabled}
              onChange={(e) => updateField(field.id, { label: e.target.value })}
            />
            <select
              className="form-control"
              style={{ flex: "0 0 130px" }}
              value={field.type}
              disabled={disabled}
              onChange={(e) => updateField(field.id, { type: e.target.value as DocumentField["type"] })}
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={field.required}
                disabled={disabled}
                onChange={(e) => updateField(field.id, { required: e.target.checked })}
              />
              必須
            </label>
          </div>

          {field.type === "select" && (
            <input
              className="form-control"
              placeholder="選択肢をカンマ区切りで入力(例: 父,母,その他)"
              value={(field.options || []).join(",")}
              disabled={disabled}
              onChange={(e) => updateField(field.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          )}

          {showSystemMapping && (
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>この項目の内容(選手アカウント発行に使う場合のみ選択)</label>
              <select
                className="form-control"
                value={field.mapsTo || ""}
                disabled={disabled}
                onChange={(e) => updateField(field.id, { mapsTo: e.target.value || null })}
              >
                <option value="">— 自由記述として保存のみ —</option>
                {SYSTEM_FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={usedMappings.has(opt.value) && field.mapsTo !== opt.value}>
                    {opt.label}{usedMappings.has(opt.value) && field.mapsTo !== opt.value ? "(他の項目で使用中)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" className="btn" disabled={disabled || index === 0} onClick={() => moveField(field.id, -1)} style={{ padding: "4px 10px", fontSize: "12px" }}>↑</button>
            <button type="button" className="btn" disabled={disabled || index === fields.length - 1} onClick={() => moveField(field.id, 1)} style={{ padding: "4px 10px", fontSize: "12px" }}>↓</button>
            <button
              type="button"
              className="btn"
              disabled={disabled}
              onClick={() => removeField(field.id)}
              style={{ padding: "4px 10px", fontSize: "12px", color: "var(--danger)" }}
            >
              削除
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn" disabled={disabled} onClick={addField} style={{ alignSelf: "flex-start" }}>
        + 項目を追加
      </button>
    </div>
  );
}
