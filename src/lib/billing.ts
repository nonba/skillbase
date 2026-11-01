// HOMEBASEの料金プランと会費PayコースIDのマッピング。
// 会費PayはコースをAPIから作成できない(GET専用)ため、会費Pay管理画面 > 設定 > コース で
// 同名・同額のコースを手動作成し、scripts/kaihipay-list-courses.js で取得したIDをここに貼る。
export const KAIHIPAY_COURSE_IDS = {
  base_30: 641063,
  base_60: 641064,
  base_90: 641066,
  base_120: 641067,
  storage_10: 641068,
  storage_30: 641069,
  storage_50: 641070,
  score_simple: 641072,
  // ベースプラン割引コース(2026-08-27追加)。会費Payはコースの金額を任意に(APIで)変更できないため、
  // 割引率ごとに金額固定の専用コースを会費Pay管理画面で手動作成し、ここにIDを貼っている。
  // 「特割30%」「通常キャンペーン10%」「100%(ベースのみ全額オフ。会員登録・カード登録・
  // スコア/ストレージの課金は通常通り必要 — 会費Pay登録自体が不要な完全免除はCoupon.fullyExempt側で扱う)」の3パターン。
  base_30_d30: 641127,
  base_30_d10: 641128,
  base_60_d30: 641129,
  base_60_d10: 641130,
  base_90_d30: 641131,
  base_90_d10: 641132,
  base_120_d30: 641133,
  base_120_d10: 641134,
  base_30_d100: 641202,
  base_60_d100: 641203,
  base_90_d100: 641204,
  base_120_d100: 641205,
} as const;

const GB = 1073741824;

export function getBasePlanKey(maxUsers: number): keyof typeof KAIHIPAY_COURSE_IDS {
  if (maxUsers <= 30) return "base_30";
  if (maxUsers <= 60) return "base_60";
  if (maxUsers <= 90) return "base_90";
  return "base_120";
}

// プラン別標準容量（settings/page.tsxのgetStandardStorageと同じ基準）
export function getStandardStorageBytes(maxUsers: number): number {
  if (maxUsers <= 30) return 5 * GB;
  if (maxUsers <= 60) return 8 * GB;
  if (maxUsers <= 90) return 12 * GB;
  return 15 * GB;
}

// 標準容量からの追加分(バイト)を、+50/+30/+10の順で貪欲に分解して各パック数を復元する
// (settings/page.tsxの復元ロジックと同じ考え方。最大3パックまで)
export function decomposeStoragePacks(maxUsers: number, maxStorageBytes: number) {
  const stdBytes = getStandardStorageBytes(maxUsers);
  let addedGB = Math.max(0, Math.round((maxStorageBytes - stdBytes) / GB));
  let gb50 = 0, gb30 = 0, gb10 = 0;
  while (addedGB >= 50 && gb50 + gb30 + gb10 < 3) { gb50++; addedGB -= 50; }
  while (addedGB >= 30 && gb50 + gb30 + gb10 < 3) { gb30++; addedGB -= 30; }
  while (addedGB >= 10 && gb50 + gb30 + gb10 < 3) { gb10++; addedGB -= 10; }
  return { gb10, gb30, gb50 };
}

// 割引適用中のベースプランコースIDを返す(該当する割引コースが無ければ通常価格のコースにフォールバック)。
function getBasePlanCourseId(maxUsers: number, discountPercent: number): number {
  const tierKey = getBasePlanKey(maxUsers);
  if (discountPercent === 100 || discountPercent === 30 || discountPercent === 10) {
    const discountedKey = `${tierKey}_d${discountPercent}` as keyof typeof KAIHIPAY_COURSE_IDS;
    if (discountedKey in KAIHIPAY_COURSE_IDS) {
      return KAIHIPAY_COURSE_IDS[discountedKey];
    }
  }
  return KAIHIPAY_COURSE_IDS[tierKey];
}

// チームに適用中のクーポンから、今まさに有効な割引率(%)を算出する。100%も通常の割引率と同じくこの
// 関数で判定する(呼び出し側で===100かつCoupon.fullyExemptなら会費Pay登録自体をスキップする。
// fullyExemptでない100%は、ベースプランを¥0コースに差し替えるだけの通常割引として扱われる)。
// 期間限定クーポン(durationMonths指定)は、couponAppliedAtからその月数が経過すると自動的に0(割引なし)に戻る
// (Cronなしで、参照するたびに現在時刻と比較するだけの遅延判定。このプロジェクトの他の遅延更新と同じ考え方)。
export function getEffectiveCouponDiscountPercent(
  coupon: { discountPercent: number; durationMonths: number | null; active: boolean; expiresAt: Date | null } | null | undefined,
  couponAppliedAt: Date | null | undefined
): number {
  if (!coupon || !coupon.active) return 0;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return 0; // コード自体の有効期限切れ
  if (coupon.durationMonths !== null) {
    if (!couponAppliedAt) return 0;
    const periodEnd = new Date(couponAppliedAt);
    periodEnd.setMonth(periodEnd.getMonth() + coupon.durationMonths);
    if (new Date() >= periodEnd) return 0; // 適用チームでの割引期間が終了済み
  }
  return coupon.discountPercent;
}

// 会費Payへの会員登録自体が不要な「完全免除」クーポンが今まさに有効か(審査用アカウント等)。
// Coupon.fullyExempt=trueかつ、今まさに有効な割引率が100%の場合のみ真になる。
export function isFullyExemptCoupon(
  coupon: { discountPercent: number; durationMonths: number | null; active: boolean; expiresAt: Date | null; fullyExempt: boolean } | null | undefined,
  couponAppliedAt: Date | null | undefined
): boolean {
  if (!coupon?.fullyExempt) return false;
  return getEffectiveCouponDiscountPercent(coupon, couponAppliedAt) === 100;
}

// チームの現在のプラン設定から、会費Payの会員コースID配列を組み立てる。
// 会費Payの会員コース追加APIにquantity概念が無いため、複数個必要なコース(ストレージ追加パック)は
// 同じcourse_idを個数分フラットに並べて返す(呼び出し側で現在のcustomer_coursesとdiffして追加/削除する)。
// discountPercentはgetEffectiveCouponDiscountPercent()の結果を渡す想定。ベースプランにのみ適用され、
// スコア・ストレージオプションは割引対象外(オーナー方針、2026-08-27)。
export function buildKaihipayCourseIds(
  team: { maxUsers: number; scorePlan: string; maxStorageBytes: number },
  discountPercent: number = 0
): number[] {
  const courseIds: number[] = [];
  courseIds.push(getBasePlanCourseId(team.maxUsers, discountPercent));

  const packs = decomposeStoragePacks(team.maxUsers, team.maxStorageBytes);
  for (let i = 0; i < packs.gb10; i++) courseIds.push(KAIHIPAY_COURSE_IDS.storage_10);
  for (let i = 0; i < packs.gb30; i++) courseIds.push(KAIHIPAY_COURSE_IDS.storage_30);
  for (let i = 0; i < packs.gb50; i++) courseIds.push(KAIHIPAY_COURSE_IDS.storage_50);

  if (team.scorePlan === "SIMPLE") {
    courseIds.push(KAIHIPAY_COURSE_IDS.score_simple);
  }
  return courseIds;
}

// 新規チーム登録時の「登録月＋翌月は無料」トライアル。Team.createdAtの月を起点に、
// その2ヶ月後(暦月)の1日を最初の課金対象月とする(例: 8/15登録 → 8月・9月無料、10月から課金)。
// 会員登録・決済方法(カード)登録自体は通常通りすぐ行うが、実際のコース追加(=課金開始)だけをこの日まで
// 保留する設計(会費Pay管理画面に新しいコースを用意する必要がなく、既存のnot_ready保留の仕組みを流用できる)。
export function getFreeTrialEndDate(teamCreatedAt: Date): Date {
  const d = new Date(teamCreatedAt);
  return new Date(d.getFullYear(), d.getMonth() + 2, 1);
}

export function isWithinSignupFreeTrial(teamCreatedAt: Date): boolean {
  return new Date() < getFreeTrialEndDate(teamCreatedAt);
}

// 希望するコースID配列(重複=個数)と、会費Pay側の現在のcustomer_courses(重複=個数)を比較し、
// 追加すべきcourseIdの配列と、削除すべきcustomerCourseIdの配列を返す(多重集合の差分)。
export function diffCustomerCourses(
  desiredCourseIds: number[],
  current: { customerCourseId: number; courseId: number }[]
): { toAdd: number[]; toRemove: number[] } {
  const remaining = [...current];
  const toAdd: number[] = [];
  for (const courseId of desiredCourseIds) {
    const idx = remaining.findIndex((c) => c.courseId === courseId);
    if (idx >= 0) {
      remaining.splice(idx, 1);
    } else {
      toAdd.push(courseId);
    }
  }
  return { toAdd, toRemove: remaining.map((c) => c.customerCourseId) };
}
