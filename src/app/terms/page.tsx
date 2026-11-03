import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* 印刷・PDF保存時の全ページ印刷対応CSS */}
      <style>{`
        @media print {
          html, body, div, main, article, section {
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          .container { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }
          .card { border: none !important; background: none !important; box-shadow: none !important; padding: 0 !important; }
          nav, footer, .bottom-nav, div[style*="position: fixed"], button { display: none !important; }
        }
      `}</style>
      <main className="container animate-fade-in" style={{ padding: "40px 24px", flex: 1, maxWidth: "800px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "24px", color: "var(--text-main)" }}>利用規約</h1>
        
        <div className="card card-glass" style={{ padding: "32px", color: "var(--text-main)", lineHeight: 1.8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px" }}>
          <p style={{ marginBottom: "24px" }}>
            この利用規約（以下、「本規約」といいます。）は、SKILLBASE（以下、「当サービス」といいます。）がこのウェブサイト上で提供する野球チーム管理サービス（以下、「本サービス」といいます。）の利用条件を定めるものです。登録ユーザーの皆さま（以下、「ユーザー」といいます。）には、本規約に従って、本サービスをご利用いただきます。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第1条（適用）</h2>
          <p style={{ marginBottom: "16px" }}>
            本規約は、ユーザーと当サービスとの間の本サービスの利用に関わる一切の関係に適用されるものとします。当サービスが本サービスに関し、本規約のほか、ご利用にあたってのルール等、各種の定め（以下、「個別規定」といいます。）をすることがあります。これら個別規定はその名称のいかんに関わらず、本規約の一部を構成するものとします。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第2条（利用登録）</h2>
          <p style={{ marginBottom: "16px" }}>
            本サービスにおいては、登録希望者が本規約に同意の上、当サービスの定める方法によって利用登録を申請し、当サービスがこれを承認することによって、利用登録が完了するものとします。
            当サービスは、利用登録の申請者に以下の事由があると判断した場合、利用登録の申請を承認しないことがあり、その理由については一切の開示義務を負わないものとします。
          </p>
          <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
            <li>利用登録の申請に際して虚偽 of 事項を届け出た場合</li>
            <li>本規約に違反したことがある者からの申請である場合</li>
            <li>その他、当サービスが利用登録を相当でないと判断した場合</li>
          </ul>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第3条（ユーザーIDおよびパスワードの管理）</h2>
          <p style={{ marginBottom: "16px" }}>
            ユーザーは、自己の責任において、本サービスのユーザーIDおよびパスワードを適切に管理するものとします。ユーザーは、いかなる場合にも、ユーザーIDおよびパスワードを第三者に譲渡または貸与し、もしくは第三者と共用することはできません。当サービスは、ユーザーIDとパスワードの組み合わせが登録情報と一致してログインされた場合には、そのユーザーIDを登録しているユーザー自身による利用とみなします。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第4条（利用料金および支払方法）</h2>
          <p style={{ marginBottom: "16px" }}>
            ユーザーは、本サービスの有料部分の対価として、当サービスが別途定め、ウェブサイトに表示する利用料金を、当サービスが指定する支払方法により支払うものとします。ユーザーが利用料金の支払を遅滞した場合、ユーザーは年14.6％の割合による遅延損害金を支払うものとします。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第5条（写真・メディアデータの投稿と容量制限）</h2>
          <p style={{ marginBottom: "16px" }}>
            本サービスにおけるアルバムおよびタイムライン機能において、ユーザーがアップロードする画像・動画（以下、「メディアデータ」といいます。）は、当サービスが設定する容量制限（初期1GB、有料プランにより拡張）の範囲内でのみ保存できるものとします。
            ユーザーは、著作権、肖像権その他の権利を害さないメディアデータのみをアップロードするものとし、チームの責任において管理するものとします。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第6条（禁止事項）</h2>
          <p style={{ marginBottom: "16px" }}>
            ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。
          </p>
          <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>本サービスの内容解体、リバースエンジニアリング等、本サービスの運営を妨害する行為</li>
            <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
            <li>他のユーザーに成りすます行為</li>
            <li>当サービスの提供するシステムに過度な負荷をかける行為</li>
            <li>その他、当サービスが不適切と判断する行為</li>
          </ul>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第7条（本サービスの提供の停止等）</h2>
          <p style={{ marginBottom: "16px" }}>
            当サービスは、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく本サービスの全部または一部の提供を停止または中断することができるものとします。
          </p>
          <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
            <li>本サービスにかかるコンピュータシステムの保守点検または更新を行う場合</li>
            <li>地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合</li>
            <li>コンピュータまたは通信回線等が事故により停止した場合</li>
            <li>その他、当サービスが本サービスの提供が困難と判断した場合</li>
          </ul>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第8条（利用制限および登録抹消）</h2>
          <p style={{ marginBottom: "16px" }}>
            当サービスは、ユーザーが本規約のいずれかの条項に違反した場合、または事前通知なく本サービスの利用を制限し、ユーザー登録を抹消することができるものとします。これによるユーザーの損害について、当サービスは一切の責任を負いません。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第9条（免責事項）</h2>
          <p style={{ marginBottom: "16px" }}>
            当サービスは、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。
            当サービスは、本サービスに起因してユーザーに生じたあらゆる損害について一切の責任を負いません。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第10条（規約の変更）</h2>
          <p style={{ marginBottom: "16px" }}>
            当サービスは、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができるものとします。なお、本規約の変更後、本サービスの利用を開始した場合には、ユーザーは変更後の規約に同意したものとみなします。
          </p>

          <h2 style={{ fontSize: "18px", fontWeight: 700, marginTop: "32px", marginBottom: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>第11条（準拠法・裁判管轄）</h2>
          <p style={{ marginBottom: "16px" }}>
            本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当サービスの本店所在地を管轄する裁判所を専属的合意管轄とします。
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
