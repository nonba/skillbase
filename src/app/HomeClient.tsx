"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export default function HomeClient() {
  const { data: session } = useSession();

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--text-main)" }}>
      {/* ヘッダー */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
          maxWidth: "1100px",
          margin: "0 auto",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 900, fontSize: "22px" }}>
          <span style={{ color: "var(--primary)" }}>⚡</span>
          <span>SKILLBASE</span>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {session?.user ? (
            <Link href="/dashboard" className="btn btn-primary" style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 800 }}>
              ダッシュボードへ ➔
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-secondary" style={{ padding: "9px 18px", fontSize: "13px", fontWeight: 700 }}>
                ログイン
              </Link>
              <Link href="/register" className="btn btn-primary" style={{ padding: "9px 18px", fontSize: "13px", fontWeight: 800 }}>
                新規登録
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ヒーローセクション */}
      <section style={{ maxWidth: "920px", margin: "0 auto", padding: "72px 24px 56px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: "20px",
            background: "rgba(255, 107, 0, 0.15)",
            border: "1px solid rgba(255, 107, 0, 0.35)",
            color: "var(--primary)",
            fontSize: "12px",
            fontWeight: 800,
            marginBottom: "20px",
          }}
        >
          ⚾ 野球チームのための「指導・知識共有・育成」特化プラットフォーム
        </div>

        <h1
          style={{
            fontSize: "clamp(28px, 5.5vw, 48px)",
            fontWeight: 900,
            lineHeight: 1.25,
            marginBottom: "20px",
          }}
        >
          チームの知識・技術・指導動画を、
          <br />
          <span style={{ color: "var(--primary)" }}>すべての選手のスキル</span>に変える。
        </h1>

        <p
          style={{
            fontSize: "clamp(14px, 2.2vw, 17px)",
            color: "var(--text-muted)",
            maxWidth: "680px",
            margin: "0 auto 36px",
            lineHeight: 1.8,
          }}
        >
          SKILLBASE（スキルベース）は、監督・コーチの野球知識や参考動画、練習メニューを
          「全体」「学年別」「グループ別」「選手個人」へピンポイントに届ける会員制の教育・コミュニケーションツールです。
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap" }}>
          <Link
            href={session?.user ? "/dashboard" : "/login"}
            className="btn btn-primary"
            style={{ padding: "14px 32px", fontSize: "16px", fontWeight: 800, borderRadius: "30px" }}
          >
            {session?.user ? "SKILLBASEを開く ➔" : "ログインして始める ➔"}
          </Link>
          {!session?.user && (
            <Link
              href="/register"
              className="btn btn-secondary"
              style={{ padding: "14px 28px", fontSize: "15px", fontWeight: 700, borderRadius: "30px" }}
            >
              代表者アカウント登録
            </Link>
          )}
        </div>
      </section>

      {/* 3つの柱 */}
      <section style={{ maxWidth: "1040px", margin: "0 auto", padding: "24px 24px 80px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px",
          }}
        >
          <div className="card card-glass" style={{ padding: "28px 24px", borderTop: "3px solid var(--primary)" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>📚</div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>
              コラム＆動画ライブラリ
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.75 }}>
              YouTube参考動画や撮影した指導動画、PDF資料、技術コラムをカテゴリー別に蓄積。
              「全学年」「1年生のみ」「投手グループ」「特定の選手個人」など配信対象を自在に選べ、誰が読んだか（見たよ確認）も一目で把握できます。
            </p>
          </div>

          <div className="card card-glass" style={{ padding: "28px 24px", borderTop: "3px solid #3b82f6" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>💬</div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>
              タイムライン＆ハイライト共有
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.75 }}>
              日々の気づきや練習のハイライト動画、アンケート、アルバムをチーム内でリアルタイムに共有。
              グループごとの絞り込みにも対応し、必要な情報が迷わず届きます。
            </p>
          </div>

          <div className="card card-glass" style={{ padding: "28px 24px", borderTop: "3px solid #10b981" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✉️</div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "10px" }}>
              個別DM＆音声・ビデオ通話
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.75 }}>
              選手からの自主練フォーム動画の相談や、コーチからの個別アドバイスをDMや通話でサポート。
              一人ひとりに寄り添った育成環境を実現します。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
