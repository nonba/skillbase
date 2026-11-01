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
