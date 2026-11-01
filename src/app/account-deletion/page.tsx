import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function AccountDeletionPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <main className="container animate-fade-in" style={{ padding: "40px 24px", flex: 1, maxWidth: "800px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "24px", color: "var(--text-main)" }}>HOMEBASE アカウント削除・データ削除のご案内</h1>

        <div className="card card-glass" style={{ padding: "32px", color: "var(--text-main)", lineHeight: 1.8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px" }}>
          <p style={{ marginBottom: "24px" }}>
            HOMEBASE（野球チーム管理アプリ）のアカウントおよび、それに紐づく個人データの削除をご希望の場合の手順をご案内します。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>アプリ内から削除する（推奨）</h2>
          <p style={{ marginBottom: "16px" }}>
            アプリにログインし、「マイページ」画面下部の「アカウントを削除する」からログインパスワードを入力するだけで、その場でアカウントを削除できます。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>ログインできない場合</h2>
          <p style={{ marginBottom: "16px" }}>
            パスワードを忘れた等でアプリにログインできない場合は、下記のメールアドレス宛に、①ご登録の氏名、②ログインに使用しているメールアドレスまたはログインID、③所属チーム名、を明記の上ご連絡ください。
          </p>
          <p style={{ marginBottom: "16px", fontWeight: 700 }}>
            お問い合わせ先: support@easystance.app
          </p>
          <p style={{ marginBottom: "16px" }}>
            本人確認の上、原則として受付から14日以内にアカウントおよび対象データを削除いたします。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>削除される情報</h2>
          <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
            <li>アカウント情報（氏名、メールアドレス、ログイン情報）</li>
            <li>ご本人が投稿したタイムライン投稿・コメント・メッセージ・写真・動画</li>
            <li>個人成績データ（打撃・投球記録）</li>
            <li>プロフィール情報（背番号、ポジション等）</li>
          </ul>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>保持される場合がある情報</h2>
          <p style={{ marginBottom: "16px" }}>
            チーム全体の記録（試合結果・チーム成績など、他のメンバーと共有され当該メンバー個人の特定に直結しない情報）は、チームの運営継続のため、退会後も削除されない場合があります。また、法令により保存が義務付けられている請求・決済情報がある場合は、必要な期間保持することがあります。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>チーム自体の削除について</h2>
          <p style={{ marginBottom: "16px" }}>
            チームのオーナー（監督・代表者）は、チーム設定画面から「チームを解散する」操作により、チームに関する全データ（予定・タイムライン・アルバム・メッセージ・成績等）を完全に削除できます。この場合、メンバー個人のアカウント自体は削除されず、「チーム未所属」の状態に戻ります。
          </p>

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
