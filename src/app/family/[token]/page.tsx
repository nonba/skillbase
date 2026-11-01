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

const roleLabel = (r: string) => (r === "PLAYER" ? "⚾ 選手" : r === "MANAGER" ? "📋 指導者" : "👪 保護者");

export default function FamilyOnboardingPage() {
  const params = useParams();
  const token = params?.token as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/family-onboarding/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "取得に失敗しました。");
        setTeamName(data.teamName);
        setAccounts(data.accounts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--background, #f8fafc)", padding: "24px 16px" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "22px", fontWeight: 900, background: "linear-gradient(135deg, #4f46e5, #ff8c00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>HOMEBASE</div>
          {teamName && <div style={{ fontSize: "14px", color: "#64748b", marginTop: "4px" }}>{teamName}</div>}
        </div>

        {loading && <p style={{ textAlign: "center", color: "#64748b" }}>読み込み中...</p>}

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "10px", padding: "16px", fontSize: "14px", textAlign: "center" }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: "10px", padding: "14px 16px", marginBottom: "20px", fontSize: "13px", color: "#3730a3", lineHeight: 1.6 }}>
              下のIDとパスワードで、アプリまたはブラウザからログインしてください。初回ログイン時にパスワードの変更をお願いします。
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              {accounts.map((a, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>{roleLabel(a.role)}</div>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "8px" }}>{a.name}</div>
                  <div style={{ fontSize: "14px" }}>
                    ID: <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>{a.loginId}</code>
                  </div>
                  {a.activated ? (
                    <div style={{ fontSize: "13px", color: "#16a34a", marginTop: "8px", fontWeight: 700 }}>✓ 設定済み（ログイン済みのため仮パスワードは表示されません）</div>
                  ) : (
                    <div style={{ fontSize: "14px", marginTop: "4px" }}>
                      仮パスワード: <code style={{ background: "#fef9c3", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>{a.tempPassword}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <a
              href="https://homebase.easystance.app/login"
              style={{ display: "block", textAlign: "center", background: "#4f46e5", color: "#fff", fontWeight: 700, padding: "14px", borderRadius: "12px", textDecoration: "none", fontSize: "15px" }}
            >
              ログイン画面を開く
            </a>
            <p style={{ textAlign: "center", fontSize: "11px", color: "#94a3b8", marginTop: "16px" }}>
              このページは30日間有効です。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
