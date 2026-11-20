import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getEnv(key: string): string {
  // 1. Try getCloudflareContext().env
  try {
    const ctx = getCloudflareContext();
    if (ctx?.env && (ctx.env as any)[key]) {
      return (ctx.env as any)[key];
    }
  } catch (e) {
    // getCloudflareContext throws if called outside request context
  }

  // 2. Fallback to process.env
  return process.env[key] || "";
}

/**
 * BASE 共通窓口（ID・成績）のベースURLを返す。
 * 設定（環境変数 BASE_ID_URL）だけで homebase.easystance.app → id.easystance.app へ差し替え可能にする。
 * ローカル開発（NODE_ENV !== "production"）で BASE_ID_URL が未設定の場合は、fallbackOrigin（自身のローカルサーバー）を使って手元で通し確認できる。
 */
export function getBaseIdUrl(fallbackOrigin?: string): string {
  const configured = getEnv("BASE_ID_URL").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production" && fallbackOrigin) {
    return fallbackOrigin.replace(/\/$/, "");
  }
  return "";
}

/**
 * 通行証の署名検証用シークレットを返す。
 * 本番では必ず環境変数 ID_TICKET_SECRET（32文字以上）を使い、ローカル開発時のみ未設定なら開発用シークレットを使う。
 */
export function getIdTicketSecret(): string {
  const configured = getEnv("ID_TICKET_SECRET").trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "skillbase-local-dev-ticket-secret-2026-32bytes";
  }
  return "";
}
