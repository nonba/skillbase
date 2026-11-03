import { Resend } from "resend";
import { getEnv } from "./env";

// Resend経由のメール送信(2026-08-27追加)。ドメインeasystance.appはResend側で認証済み。
// これまでこのアプリからメールを送ったことは一度もなく、この用途(上限超過アナウンス)が初導入。
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = getEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured, skipping email send.");
    return;
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "SKILLBASE <noreply@easystance.app>",
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Resend email send error:", error);
  }
}

function getAppBaseUrl(): string {
  return (getEnv("NEXTAUTH_URL") || process.env.NEXTAUTH_URL || "https://skillbase.easystance.app").replace(/\/$/, "");
}

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const verifyUrl = `${getAppBaseUrl()}/api/auth/verify-email?token=${token}`;
  const html = `
    <p>${name} 様</p>
    <p>SKILLBASEへのご登録ありがとうございます。以下のリンクをクリックして、メールアドレスの確認を完了してください。</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>リンクをクリックするまでログインできませんのでご注意ください。</p>
    <p>心当たりがない場合は、このメールを破棄してください。</p>
  `;
  await sendEmail(to, "【SKILLBASE】メールアドレスの確認をお願いします", html);
}

// 申込書(/d/[id]、書類の保管庫のAPPLICATION種別)が送信された際、チーム管理者(isOwner or role=MANAGER)全員に送る通知。
export async function sendEnrollmentNotificationEmails(
  toList: string[],
  teamName: string,
  playerName: string,
  guardianName: string
): Promise<void> {
  const appUrl = `${getAppBaseUrl()}/attach/applications`;
  const html = `
    <p>${teamName} 宛てに新しい入団申込みが届きました。</p>
    <p>選手名: ${playerName}<br/>保護者名: ${guardianName}</p>
    <p>内容の確認はこちらから: <a href="${appUrl}">${appUrl}</a></p>
  `;
  await Promise.all(toList.map((to) => sendEmail(to, "【SKILLBASE】新しい入団申込みが届きました", html)));
}

export interface DuesEmailLineItem {
  name: string;
  amount: number;
  annualMonth?: number;
}
export interface DuesEmailBreakdown {
  oneTime: DuesEmailLineItem[];
  oneTimeTotal: number;
  monthly: DuesEmailLineItem[];
  monthlyTotal: number;
  annual: DuesEmailLineItem[];
  annualTotal: number;
  monthlyMultiples?: { months: number; amount: number }[];
  // 今月入団した場合の、締め月までの残り月数分の月謝(2026-09-10追加)。
  remainingMonthsThisYear?: { remainingMonths: number; amount: number };
}

function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function duesBreakdownHtml(dues: DuesEmailBreakdown, paymentInfo?: string | null): string {
  const section = (title: string, items: DuesEmailLineItem[], total: number) => {
    if (items.length === 0) return "";
    const rows = items
      .map((i) => `<li>${i.name}${i.annualMonth ? `(${i.annualMonth}月)` : ""}: ${formatYen(i.amount)}</li>`)
      .join("");
    return `<p><strong>${title}（合計 ${formatYen(total)}）</strong></p><ul>${rows}</ul>`;
  };
  const multiples =
    dues.monthlyMultiples && dues.monthlyMultiples.length > 0
      ? `<p><strong>月謝まとめ払いの目安</strong></p><ul>${dues.monthlyMultiples
          .map((m) => `<li>${m.months}ヶ月分: ${formatYen(m.amount)}</li>`)
          .join("")}</ul>`
      : "";
  const remaining = dues.remainingMonthsThisYear
    ? `<p><strong>今年度の残り${dues.remainingMonthsThisYear.remainingMonths}ヶ月分の月謝: ${formatYen(dues.remainingMonthsThisYear.amount)}</strong></p>`
    : "";
  // お支払い方法・振込先(2026-09-10追加)。チームが設定していれば団費内訳の最後に載せる。
  // 自由記述のためHTMLエスケープしつつ改行をそのまま反映する。
  const payment = paymentInfo
    ? `<p><strong>お支払い方法</strong></p><p style="white-space:pre-wrap;">${paymentInfo
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
    : "";
  return [
    section("入団時にかかる費用", dues.oneTime, dues.oneTimeTotal),
    section("毎月の費用", dues.monthly, dues.monthlyTotal),
    remaining,
    multiples,
    section("毎年かかる費用", dues.annual, dues.annualTotal),
    payment,
  ].join("");
}

// 入団申込みの承認時、自動作成したアカウント一覧の受け取りリンクと団費内訳を保護者に送るメール。
export async function sendEnrollmentAccountsIssuedEmail(
  to: string,
  teamName: string,
  playerName: string,
  onboardingToken: string,
  dues?: DuesEmailBreakdown,
  paymentInfo?: string | null
): Promise<void> {
  const onboardingUrl = `${getAppBaseUrl()}/family/${onboardingToken}`;
  const html = `
    <p>${teamName} への入団が承認され、アプリのアカウントが発行されました。</p>
    <p>選手名: ${playerName}</p>
    <p>以下のリンクからログインID・仮パスワードをご確認ください（30日間有効です）。</p>
    <p><a href="${onboardingUrl}">${onboardingUrl}</a></p>
    ${dues ? duesBreakdownHtml(dues, paymentInfo) : ""}
  `;
  await sendEmail(to, `【${teamName}】アカウントが発行されました`, html);
}

// 進級処理(学年+1)時、新学年での団費内訳を保護者へ知らせるメール(2026-09-04追加)。
export async function sendGradePromotionEmail(
  to: string,
  teamName: string,
  playerName: string,
  newGradeLabel: string,
  dues: DuesEmailBreakdown,
  paymentInfo?: string | null
): Promise<void> {
  const html = `
    <p>${teamName} より、進級のお知らせです。</p>
    <p>選手名: ${playerName}<br/>新学年: ${newGradeLabel}</p>
    <p>新学年での団費は以下の通りです。</p>
    ${duesBreakdownHtml(dues, paymentInfo)}
  `;
  await sendEmail(to, `【${teamName}】進級のお知らせ（新学年の団費のご案内）`, html);
}

// 申込み者本人(保護者)への受付完了メール。
export async function sendEnrollmentConfirmationEmail(
  to: string,
  teamName: string,
  playerName: string
): Promise<void> {
  const html = `
    <p>${teamName} への入団申込みを受け付けました。</p>
    <p>選手名: ${playerName}</p>
    <p>チームからの連絡をお待ちください。このメールは送信専用です。心当たりがない場合は破棄してください。</p>
  `;
  await sendEmail(to, `【${teamName}】入団申込みを受け付けました`, html);
}
