// 「BASE アカウントでログイン」の通行証（試作・2026-11-11。docs/SKILLBASE_LINK_DESIGN.md の 4・案1）。
// HOMEBASE（土台）が、ログイン済みの人に、短い期限（3分）の、署名つきの通行証を発行する。
// 受け取るアプリ（SKILLBASE など）は、同じ秘密 ID_TICKET_SECRET で署名を確かめ、aud（宛先）・exp（期限）・state（開始時の合言葉）を見る。
// 通行証に入れるのは、最小限だけ: 人の id（sub）・名前・チーム id・宛先・期限・合言葉。メールアドレスや個人情報は入れない。
// 形: base64url(JSON).base64url(HMAC-SHA256)。

export interface TicketClaims {
  sub: string; // HOMEBASE の User.id（= BASE アカウントの人の id）
  name: string;
  teamId: string | null;
  aud: string; // 宛先のアプリ。例: "skillbase"
  state: string; // アプリが、ログインを始めたときに決めた合言葉（別の人に差し込まれるのを防ぐ）
  iat: number; // 発行（秒）
  exp: number; // 期限（秒）
}

export const TICKET_LIFETIME_SECONDS = 180;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signTicket(claims: Omit<TicketClaims, "iat" | "exp">, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const full: TicketClaims = { ...claims, iat: nowSec, exp: nowSec + TICKET_LIFETIME_SECONDS };
  const body = b64url(enc.encode(JSON.stringify(full)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** 署名・宛先・期限を確かめる。受け取り側(SKILLBASE)も、同じ手順で確かめる。state は、受け取り側が、自分の持つ合言葉と見比べる */
export async function verifyTicket(ticket: string, secret: string, aud: string, nowSec = Math.floor(Date.now() / 1000)): Promise<TicketClaims | null> {
  const [body, sig] = ticket.split(".");
  if (!body || !sig || ticket.split(".").length !== 2) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), b64urlToBytes(sig) as BufferSource, enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as TicketClaims;
    if (c.aud !== aud || typeof c.sub !== "string" || typeof c.state !== "string") return null;
    if (nowSec >= c.exp || c.exp - c.iat > TICKET_LIFETIME_SECONDS) return null;
    return c;
  } catch {
    return null;
  }
}
