"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function AdminInquiriesPage() {
  const { data, error, mutate } = useSWR("/api/admin/inquiries", fetcher);

  const inquiries = data?.inquiries || [];

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch("/api/admin/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (res.ok) {
        mutate();
      } else {
        alert("ステータスの更新に失敗しました");
      }
    } catch (err) {
      console.error(err);
      alert("エラーが発生しました");
    }
  };

  if (error) return <div style={{ padding: "24px", color: "var(--danger)" }}>読み込みに失敗しました。</div>;
  if (!data) return <div style={{ padding: "24px" }}>読み込み中...</div>;

  return (
    <div className="container" style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "24px" }}>✉️ お問い合わせ管理</h1>

      {inquiries.length === 0 ? (
        <div className="card card-glass" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
          現在お問い合わせはありません。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {inquiries.map((inquiry: any) => (
            <div key={inquiry.id} className="card card-glass" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                    <span className={`badge ${
                      inquiry.status === "UNREAD" ? "badge-danger" :
                      inquiry.status === "READ" ? "badge-primary" :
                      "badge-success"
                    }`}>
                      {inquiry.status === "UNREAD" ? "未読" : inquiry.status === "READ" ? "対応中" : "完了"}
                    </span>
                    <span className="badge badge-secondary" style={{ background: "rgba(0,0,0,0.05)" }}>
                      {inquiry.type}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {new Date(inquiry.createdAt).toLocaleString("ja-JP")}
                    </span>
                  </div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px 0" }}>{inquiry.name}</h3>
                  <a href={`mailto:${inquiry.email}`} style={{ fontSize: "14px", color: "var(--primary)", textDecoration: "none" }}>{inquiry.email}</a>
                </div>
                
                <div>
                  <select
                    className="form-control"
                    style={{ padding: "8px 12px", width: "120px", cursor: "pointer" }}
                    value={inquiry.status}
                    onChange={(e) => handleStatusChange(inquiry.id, e.target.value)}
                  >
                    <option value="UNREAD">未読</option>
                    <option value="READ">対応中</option>
                    <option value="RESOLVED">完了</option>
                  </select>
                </div>
              </div>
              
              <div style={{ 
                background: "var(--surface-hover)", 
                padding: "16px", 
                borderRadius: "var(--radius-sm)", 
                color: "var(--text-main)", 
                whiteSpace: "pre-wrap", 
                fontSize: "14px",
                border: "1px solid var(--border)"
              }}>
                {inquiry.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
