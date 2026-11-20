"use client";

import Link from "next/link";
import BaseStatsCard from "@/components/BaseStatsCard";
import SimpleStatsPrototypeCard from "@/components/SimpleStatsPrototypeCard";

// ローカルでの画面確認用プレビューページ（ログイン不要で成績カードと簡易入力試作をすぐ触れる画面）
export default function ProtoStatsPreviewPage() {
  return (
    <main className="container animate-fade-in" style={{ padding: "32px 20px", maxWidth: "960px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
        <div>
          <span className="badge badge-accent" style={{ marginBottom: "6px", display: "inline-block" }}>
            ローカル画面確認用プレビュー
          </span>
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>
            📊 SKILLBASE 成績表示 ＆ 簡易一括入力（試作確認）
          </h1>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href="/login" className="btn btn-secondary" style={{ fontSize: "13px", padding: "8px 14px", textDecoration: "none" }}>
            🔑 新ログイン画面を見る
          </Link>
          <Link href="/dashboard/profile" className="btn btn-primary" style={{ fontSize: "13px", padding: "8px 14px", textDecoration: "none" }}>
            👤 マイページへ
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* 1. 単独チーム向け Excel風一括入力 & 個人入力 & 36項目チェック選択 */}
        <SimpleStatsPrototypeCard
          playerName="山田 太郎"
          rosterPlayers={[
            { id: "p1", name: "山田 太郎", jerseyNumber: "1" },
            { id: "p2", name: "佐藤 健太", jerseyNumber: "6" },
            { id: "p3", name: "鈴木 翔太", jerseyNumber: "10" },
            { id: "p4", name: "高橋 蓮", jerseyNumber: "18" },
            { id: "p5", name: "伊藤 大和", jerseyNumber: "2" },
            { id: "p6", name: "渡辺 蒼", jerseyNumber: "8" },
          ]}
        />

        {/* 2. BASE 共通窓口（base-stats / base-games）からの成績表示カード */}
        <BaseStatsCard />
      </div>
    </main>
  );
}
