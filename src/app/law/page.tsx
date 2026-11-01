import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function LawPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <main className="container animate-fade-in" style={{ padding: "40px 24px", flex: 1, maxWidth: "800px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "24px", color: "var(--text-main)" }}>特定商取引法に基づく表記</h1>
        
        <div className="card card-glass" style={{ padding: "32px", color: "var(--text-main)", lineHeight: 1.8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px" }}>
          <p style={{ marginBottom: "24px", fontSize: "14px", color: "var(--text-muted)" }}>
            ※ 本表記は、有料プラン（決済連携）運用時に必要な特定商取引法第11条に基づく表示項目です。販売開始時に適切な内容へ変更してください。
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", width: "30%", fontWeight: 700, verticalAlign: "top" }}>販売事業者名</th>
                <td style={{ padding: "16px 0" }}>【販売事業者・会社名をここに記入】<br />（個人事業主の場合は個人名）</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>運営責任者</th>
                <td style={{ padding: "16px 0" }}>【運営責任者の氏名をここに記入】</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>所在地</th>
                <td style={{ padding: "16px 0" }}>
                  【郵便番号および詳細住所をここに記入】<br />
                  ※ 電話番号や住所の表記については、一定の要件を満たす場合に限り開示請求に応じる書面やメールでの開示も認められますが、事前記入が推奨されます。
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>お問い合わせ窓口</th>
                <td style={{ padding: "16px 0" }}>
                  【メールアドレス、または電話番号をここに記入】<br />
                  または、<Link href="/contact" style={{ color: "var(--primary)", fontWeight: 600 }}>お問い合わせフォーム</Link>よりご連絡ください。
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>販売価格</th>
                <td style={{ padding: "16px 0" }}>
                  各プランのご案内ページ、またはダッシュボード内のプラン変更画面に表示されている価格（消費税等を含む金額）となります。
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>販売価格以外に発生する料金</th>
                <td style={{ padding: "16px 0" }}>
                  当サービスのWebサイトにアクセス、またはデータアップロードをする際に発生するデータ通信料金（パケット通信料）およびインターネットプロバイダー接続料金。
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>お支払い方法</th>
                <td style={{ padding: "16px 0" }}>
                  銀行口座振替（指定銀行口座からの毎月自動引き落とし）、銀行振込など、当サービスが指定する決済手段。
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>代金の支払時期</th>
                <td style={{ padding: "16px 0" }}>
                  月額サブスクリプションプランは、初回登録時、および毎月対応する日付において自動で引き落とし（または前払い）がなされます。
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>役務の提供時期</th>
                <td style={{ padding: "16px 0" }}>
                  利用登録およびお支払いの完了手続きののち、即時にダッシュボード上で対応するプランがアクティベートされ、ご利用可能な状態となります。
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "16px 0", textAlign: "left", fontWeight: 700, verticalAlign: "top" }}>解約・キャンセルについて</th>
                <td style={{ padding: "16px 0" }}>
                  サービスの性質上、お支払い完了後のキャンセル・返品（返金）は応じかねます。
                  翌月以降の課金の解約を希望される場合は、課金周期が更新される前日までにダッシュボードの設定画面より解約手続きを完了させる必要がございます。解約された場合も日割りでの返金は行わず、課金期間の満了まで有料プランをご利用いただけます。
                </td>
              </tr>
            </tbody>
          </table>
          
          <div style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
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
