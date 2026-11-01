"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

// チームの対外向けプロフィールページ（試作・第一段階）。
// 将来のチーム間連携（対戦モード）の土台。選手名簿は一切含まない、チームの紹介のみの読み取り専用ページ。
const categoryLabel: { [key: string]: string } = {
  ELEMENTARY: "小学生",
  JUNIOR_HIGH: "中学生",
  HIGH_SCHOOL: "高校生",
};
const ballTypeLabel: { [key: string]: string } = {
  SOFT: "軟式",
  HARD: "硬式",
};

export default function TeamProfilePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { status } = useSession();
  const router = useRouter();
  const { teamId } = use(params);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const { data, error, isLoading } = useSWR<{ team: any }>(
    status === "authenticated" ? `/api/team-profile/${teamId}` : null,
    fetcher
  );

  return (
    <div className="container" style={{ padding: "40px 20px", maxWidth: "560px", margin: "0 auto" }}>
      <div style={{ marginBottom: "16px" }}>
        <Link href="/dashboard" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "14px" }}>
          ← ダッシュボードに戻る
        </Link>
      </div>

      {isLoading && <p style={{ textAlign: "center", color: "var(--text-muted)" }}>読み込み中...</p>}
      {error && (
        <div className="card card-glass" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ color: "var(--text-muted)" }}>このプロフィールは非公開か、見つかりませんでした。</p>
        </div>
      )}

      {data?.team && (
        <div className="card card-glass" style={{ padding: "24px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "10px" }}>{data.team.name}</h1>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "16px", background: "rgba(79, 70, 229, 0.1)", color: "var(--primary)" }}>
              {categoryLabel[data.team.category] || data.team.category}
            </span>
            {data.team.ballType && (
              <span style={{ fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "16px", background: "rgba(0,0,0,0.05)", color: "var(--text-muted)" }}>
                {ballTypeLabel[data.team.ballType] || data.team.ballType}
              </span>
            )}
          </div>

          {data.team.description && (
            <p style={{ fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: "16px" }}>{data.team.description}</p>
          )}

          {data.team.homeGround && (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              📍 {data.team.homeGround}
            </p>
          )}

          {data.team.snsLinks && data.team.snsLinks.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {data.team.snsLinks.map((link: any, idx: number) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "13px", color: "var(--primary)", textDecoration: "underline" }}
                >
                  🔗 {link.label || link.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
