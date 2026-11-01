"use client";

import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { useState } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("機能に関するご質問");
  const [content, setContent] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !content) {
      setError("すべての項目を入力してください。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, type, content }),
      });

      if (!res.ok) {
        throw new Error("送信に失敗しました。");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <main className="container animate-fade-in" style={{ padding: "40px 24px", flex: 1, maxWidth: "800px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "24px" }}>お問い合わせ</h1>
        
        <div className="card card-glass" style={{ padding: "32px" }}>
          {success ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>✉️</div>
              <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "16px" }}>お問い合わせを受け付けました</h2>
              <p style={{ color: "var(--text-muted)", marginBottom: "32px" }}>
                内容を確認次第、ご入力いただいたメールアドレス宛にご連絡いたします。
              </p>
              <Link href="/" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
                トップページへ戻る
              </Link>
            </div>
          ) : (
            <>
              <p style={{ color: "var(--text-main)", marginBottom: "24px", lineHeight: 1.6 }}>
                サービスに関するご質問、ご要望、不具合の報告などはこちらからお気軽にお問い合わせください。
              </p>

              {error && <div className="alert alert-danger" style={{ marginBottom: "20px" }}>{error}</div>}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>お名前</label>
                  <input type="text" className="form-control" placeholder="山田 太郎" value={name} onChange={e => setName(e.target.value)} disabled={loading} />
                </div>
                
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>メールアドレス</label>
                  <input type="email" className="form-control" placeholder="example@gmail.com" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
                </div>
                
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>お問い合わせ種別</label>
                  <select className="form-control" value={type} onChange={e => setType(e.target.value)} disabled={loading}>
                    <option value="機能に関するご質問">機能に関するご質問</option>
                    <option value="不具合の報告">不具合の報告</option>
                    <option value="プラン・料金について">プラン・料金について</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
                
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>お問い合わせ内容</label>
                  <textarea className="form-control" rows={6} placeholder="お問い合わせ内容をご記入ください" value={content} onChange={e => setContent(e.target.value)} disabled={loading}></textarea>
                </div>

                <button type="submit" className="btn btn-primary" style={{ padding: "16px", fontSize: "16px", fontWeight: 700, marginTop: "12px" }} disabled={loading}>
                  {loading ? "送信中..." : "送信する"}
                </button>
              </form>
            </>
          )}
          
          <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <Link href="/" style={{ color: "var(--primary)", fontWeight: 700, textDecoration: "none" }}>
              ← トップページへ戻る
            </Link>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
