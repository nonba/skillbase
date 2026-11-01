// 団費計算エンジン。DuesFeeItem(チームごとに自由設定の明細)から、
// ある選手(学年・何番目の子か)に対する金額内訳を計算する。
//
// 兄弟割引は「金額表の丸ごと差し替え」ではなく「通常金額からの定額引き」方式。
// siblingRank=1は一人目(割引なし)、2以上は在団中の兄弟を含めて何番目の子か。

export type DuesTiming = "ONE_TIME" | "MONTHLY" | "ANNUAL";

export interface DuesFeeItemLike {
  id: string;
  name: string;
  timing: string;
  annualMonth: number | null;
  active: boolean;
  amountsByGrade: string;
  hasSiblingDiscount: boolean;
  siblingDiscountByRank: string | null;
}

export interface DuesLineItem {
  id: string;
  name: string;
  amount: number;
  annualMonth?: number;
}

export interface DuesBreakdown {
  oneTime: DuesLineItem[];
  oneTimeTotal: number;
  monthly: DuesLineItem[];
  monthlyTotal: number;
  annual: DuesLineItem[];
  annualTotal: number;
  // 月謝(monthly)を何ヶ月分かまとめて支払う場合の目安。入団時の一時金(oneTime)は含まない。
  monthlyMultiples: { months: number; amount: number }[];
  // 入団月ごとの「締め月までの残り月数」早見表(2026-09-10追加)。月謝(monthly)のみ対象、
  // 入団時の一時金(oneTime)は含まない。1〜12月それぞれについて、その月に入団した場合の
  // 残り月数と金額を計算する(closingMonthを基準)。
  monthlyByJoinMonth: { joinMonth: number; remainingMonths: number; amount: number }[];
}

function parseAmounts(json: string | null): Record<string, number> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// siblingRankに対する割引額を決める。ちょうどそのrankが無ければ、それ未満の最大のrankの値を使う
// (例: rank=5だが"2","3"しか設定が無ければ"3"の値を使う)。設定が何も無ければ0。
function resolveSiblingDiscount(discountByRank: Record<string, number>, siblingRank: number): number {
  const ranks = Object.keys(discountByRank)
    .map((k) => Number(k))
    .filter((n) => !Number.isNaN(n) && n <= siblingRank)
    .sort((a, b) => b - a);
  if (ranks.length === 0) return 0;
  return discountByRank[String(ranks[0])] || 0;
}

// joinMonth(1-12)にclosingMonth(1-12、年度最終月)までの残り月数を返す(両端含む)。
// 例: closingMonth=3(3月締め)でjoinMonth=10(10月入団) → 10,11,12,1,2,3 の6ヶ月。
// joinMonthが締め月の翌月(年度はじめ)なら12ヶ月(満額)になる。
export function remainingMonthsUntilClosing(joinMonth: number, closingMonth: number): number {
  const diff = (closingMonth - joinMonth + 12) % 12;
  return diff + 1;
}

// grade: 0(体験)〜6。siblingRank: 1=一人目(割引なし)、2以上=在団中の兄弟を含め何番目の子か。
// closingMonth: 団費の締め月(1-12、既定3月)。Team.duesClosingMonthをそのまま渡す想定。
export function calculateDues(items: DuesFeeItemLike[], grade: number | null, siblingRank: number = 1, closingMonth: number = 3): DuesBreakdown {
  const oneTime: DuesLineItem[] = [];
  const monthly: DuesLineItem[] = [];
  const annual: DuesLineItem[] = [];

  const gradeKey = String(grade ?? 0);

  for (const item of items) {
    if (!item.active) continue;
    const normalAmounts = parseAmounts(item.amountsByGrade);
    const baseAmount = Number(normalAmounts[gradeKey] ?? 0);

    let discount = 0;
    if (item.hasSiblingDiscount && siblingRank > 1) {
      const discountByRank = parseAmounts(item.siblingDiscountByRank);
      const minGrade = discountByRank["minGrade"] ?? discountByRank["_minGrade"] ?? null;
      const isEligibleGrade = minGrade !== null ? (grade !== null && grade >= minGrade) : true;
      if (isEligibleGrade) {
        discount = resolveSiblingDiscount(discountByRank, siblingRank);
      }
    }
    const amount = Math.max(0, baseAmount - discount);

    const line: DuesLineItem = { id: item.id, name: item.name, amount };
    if (item.timing === "ONE_TIME") oneTime.push(line);
    else if (item.timing === "MONTHLY") monthly.push(line);
    else if (item.timing === "ANNUAL") annual.push({ ...line, annualMonth: item.annualMonth ?? undefined });
  }

  const sum = (arr: DuesLineItem[]) => arr.reduce((acc, l) => acc + l.amount, 0);
  const monthlyTotal = sum(monthly);

  return {
    oneTime,
    oneTimeTotal: sum(oneTime),
    monthly,
    monthlyTotal,
    annual,
    annualTotal: sum(annual),
    monthlyMultiples: [1, 3, 6, 12].map((months) => ({ months, amount: monthlyTotal * months })),
    monthlyByJoinMonth: Array.from({ length: 12 }, (_, i) => {
      const joinMonth = i + 1;
      const remainingMonths = remainingMonthsUntilClosing(joinMonth, closingMonth);
      return { joinMonth, remainingMonths, amount: monthlyTotal * remainingMonths };
    }),
  };
}
