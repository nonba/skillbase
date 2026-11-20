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
 */
export function getBaseIdUrl(): string {
  return getEnv("BASE_ID_URL").trim().replace(/\/$/, "");
}

