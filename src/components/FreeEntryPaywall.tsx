"use client";

import StartTrialButton from "./StartTrialButton";
import { isNativeApp } from "@/lib/platform";

const PLANS = [
  { users: 30, price: "2,500" },
  { users: 60, price: "4,500" },
  { users: 90, price: "6,500" },
  { users: 120, price: "8,500" },
];

// FREE_ENTRY(入団申込み・団費管理のみの無料枠)チームが、SKILLBASE本体側の機能(タイムライン等)を
// 開こうとした時に、実際の画面の代わりに表示するPR・料金案内(2026-09-02追加)。
// 「ロック表示で終わらせず、料金表を見せて契約に誘導したい」というオーナー要望に基づく。
// 2026-09-09再追記: App Store審査(Guideline 3.1.1)で「ブラウザで◯◯にアクセスしてお手続きください」
// 等の案内文自体が「外部の購入・契約手続きへの誘導」とみなされ再指摘されたため、ネイティブアプリでは
// 契約・プランに一切触れない中立的な文言のみ表示する(料金表・ボタン・LPへのリンクは従来通り出さない)。
export default function FreeEntryPaywall({ featureName }: { featureName: string }) {
  const native = isNativeApp();

  return (
    <div style={{ maxWidth: "560px", margin: "40px auto", padding: "0 20px" }}>
      <div className="card card-glass" style={{ textAlign: "center", padding: "32px 24px" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔒</div>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--primary)", marginBottom: "4px" }}>
          SKILLBASE Attach（SKILLBASEの無料開放部分）をご利用中です
        </p>
        <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px" }}>
          {featureName}はSKILLBASE本体の機能です
        </h1>

        {native ? (
          <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.7 }}>
            この機能はご利用いただけません。
          </p>
        ) : (
          <>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "24px" }}>
              「SKILLBASE Attach」は、入団申込み・団員リスト・団費計算をどなたでも無料でご利用いただける、
              SKILLBASE本体の一部の機能です。スケジュール共有・出欠管理・タイムライン・スコア管理など
              SKILLBASE本体の全機能は、<strong style={{ color: "var(--text-main)" }}>登録月＋翌月無料</strong>でお試しいただけます。
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px", marginBottom: "24px" }}>
              {PLANS.map((plan) => (
                <div key={plan.users} style={{ padding: "12px 4px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700 }}>{plan.users === 120 ? "120人〜" : `〜${plan.users}人`}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>月額{plan.price}円〜</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <StartTrialButton />
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "12px" }}>
              人数・オプションは後から設定画面でいつでも変更できます。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
