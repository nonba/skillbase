import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'プライバシーポリシー | HOMEBASE',
  description: 'HOMEBASE（ホームベース）のプライバシーポリシーです。',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-2xl shadow-sm border border-slate-200">
        <div className="mb-8 border-b pb-6">
          <Link href="/" className="text-emerald-600 font-bold hover:underline mb-4 inline-block">
            ← HOMEBASE トップへ戻る
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-900">プライバシーポリシー</h1>
          <p className="text-sm text-slate-500 mt-2">最終更新日: 2026年8月13日</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">1. はじめに</h2>
            <p>
              HOMEBASE（以下、「当サービス」）は、ユーザーの皆様の個人情報の保護を重要視し、以下の方針に基づき個人情報を適切に取り扱います。本プライバシーポリシーは、当サービスが提供するウェブサイトおよびモバイルアプリケーションに適用されます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">2. 取得する情報</h2>
            <p>当サービスでは、サービス提供のために以下の情報を取得する場合があります。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>アカウント情報（氏名、ユーザーID、電子メールアドレス、所属チーム）</li>
              <li>チーム活動情報（スケジュール、スコア記録、メッセージ、アルバム画像）</li>
              <li>端末・アクセス情報（IPアドレス、ブラウザの種類、プッシュ通知用トークン）</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">3. データの利用目的</h2>
            <p>取得した情報は、以下の目的のために利用いたします。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>チーム内での連絡・スケジュール共有・スコア記録等のサービス提供のため</li>
              <li>プッシュ通知による連絡・お知らせの配信のため</li>
              <li>お問い合わせ対応およびサポートを提供するため</li>
              <li>サービスの安全な運用・改善および不正利用の防止のため</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">4. 第三者提供について</h2>
            <p>
              当サービスは、法令に基づく場合やお客様の同意がある場合を除き、個人情報を第三者に提供・開示することはありません。ただし、システム運用に必要なクラウドインフラ等、適切な安全管理措置を講じた外部委託先に取扱いを委託する場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">5. データの安全管理と削除</h2>
            <p>
              当サービスは、個人情報の紛失、破壊、改ざんおよび漏洩を防止するため、適切なセキュリティ対策を実施します。ユーザーは、自身の要求に応じてアカウントデータおよび投稿データの削除を請求することができます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">6. お問い合わせ</h2>
            <p>
              本プライバシーポリシーに関するご質問やデータの開示・削除のご請求は、以下の窓口までご連絡ください。
            </p>
            <p className="mt-2 font-medium text-slate-900">
              EASY STANCE / HOMEBASE サポート窓口<br />
              メールアドレス: <a href="mailto:support@easystance.app" className="text-emerald-600 underline">support@easystance.app</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
