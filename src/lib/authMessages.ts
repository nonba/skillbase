// クライアント/サーバー両方から安全にimportできるよう、認証エラーメッセージの定数だけを独立させたファイル。
// src/lib/auth.ts はPrisma/bcryptjsなどサーバー専用モジュールをimportするため、
// クライアントコンポーネント(login/page.tsx)から直接importできない。
export const EMAIL_NOT_VERIFIED_ERROR =
  "ご登録のメールアドレスに送信した確認メールのリンクをクリックしてから、ログインしてください。";
