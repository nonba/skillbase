"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Account {
  name: string;
  role: string;
  loginId: string;
  tempPassword: string | null;
  activated: boolean;
}

const roleLabel = (r: string) => (r === "PLAYER" ? "選手" : r === "MANAGER" ? "指導者" : "保護者");

export default function FamilyOnboardingPrintPage() {
  const params = useParams();
  const token = params?.token as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/family-onboarding/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "取得に失敗しました。");
        setTeamName(data.teamName);
        setAccounts(data.accounts);
        const url = `${window.location.origin}/family/${token}`;
        const QRCode = (await import("qrcode")).default;
        setQrDataUrl(await QRCode.toDataURL(url, { width: 180, margin: 1 }));
      } catch (e: any) {
        setError(e.message || "取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <p style={{ padding: 24 }}>読み込み中...</p>;
  if (error) return <p style={{ padding: 24, color: "#b91c1c" }}>{error}</p>;

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "32px 24px", fontFamily: "sans-serif", color: "#111" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <button onClick={() => window.print()} className="no-print" style={{ marginBottom: "20px", padding: "10px 20px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}>
        🖨️ 印刷する
      </button>

      <div style={{ border: "2px solid #4f46e5", borderRadius: "16px", padding: "28px" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "#4f46e5" }}>SKILLBASE</div>
          <div style={{ fontSize: "14px", color: "#555", marginTop: "4px" }}>{teamName} ご家族用 ログイン情報</div>
        </div>

        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", marginBottom: "20px" }}>
          <div style={{ flex: 1 }}>
            {accounts.map((a, i) => (
              <div key={i} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: i < accounts.length - 1 ? "1px solid #ddd" : "none" }}>
                <div style={{ fontSize: "11px", color: "#888" }}>{roleLabel(a.role)}</div>
                <div style={{ fontWeight: 700, fontSize: "14px" }}>{a.name}</div>
                <div style={{ fontSize: "13px", marginTop: "2px" }}>
                  ID: <strong>{a.loginId}</strong>
                  {a.activated ? (
                    <span style={{ color: "#16a34a", marginLeft: "8px" }}>（設定済み）</span>
                  ) : (
                    <span style={{ marginLeft: "8px" }}>　仮パス: <strong>{a.tempPassword}</strong></span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {qrDataUrl && (
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="ログイン情報QRコード" style={{ width: "140px", height: "140px" }} />
              <div style={{ fontSize: "10px", color: "#888", marginTop: "4px", maxWidth: "140px" }}>スマホで読み取ると<br />このページが開きます</div>
            </div>
          )}
        </div>

        <div style={{ background: "#f5f5f5", borderRadius: "8px", padding: "14px 16px", fontSize: "12px", lineHeight: 1.7, color: "#444" }}>
          <strong>ご案内</strong><br />
          ①アプリをインストール、またはブラウザで skillbase.easystance.app を開いてください。<br />
          ②上記のIDとパスワードでログインしてください。<br />
          ③初回ログイン時にパスワードの変更をお願いします。<br />
          ※このシートは30日間有効です。紛失した場合はチーム管理者にご連絡ください。
        </div>
      </div>
    </div>
  );
}
