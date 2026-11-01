// チーム種別と学年の表示・選択肢を一元管理する。
// grade: null=未設定, 0=体験生, 1..6=学年。接頭辞(小/中/高)は Team.category から決まる。

export type TeamCategory = "ELEMENTARY" | "JUNIOR_HIGH" | "HIGH_SCHOOL";

export const CATEGORY_LABELS: Record<TeamCategory, string> = {
  ELEMENTARY: "小学生",
  JUNIOR_HIGH: "中学生",
  HIGH_SCHOOL: "高校生",
};

export const CATEGORY_PREFIX: Record<TeamCategory, string> = {
  ELEMENTARY: "小",
  JUNIOR_HIGH: "中",
  HIGH_SCHOOL: "高",
};

export const CATEGORY_MAX_GRADE: Record<TeamCategory, number> = {
  ELEMENTARY: 6,
  JUNIOR_HIGH: 3,
  HIGH_SCHOOL: 3,
};

export const CATEGORY_OPTIONS: { value: TeamCategory; label: string }[] = [
  { value: "ELEMENTARY", label: "小学生" },
  { value: "JUNIOR_HIGH", label: "中学生" },
  { value: "HIGH_SCHOOL", label: "高校生" },
];

function normalizeCategory(category?: string | null): TeamCategory {
  if (category === "JUNIOR_HIGH" || category === "HIGH_SCHOOL") return category;
  return "ELEMENTARY";
}

// 表示ラベル。例: (ELEMENTARY, 4) -> "小4", (_, 0) -> "体験", null -> ""
export function gradeLabel(category: string | null | undefined, grade: number | null | undefined): string {
  if (grade === null || grade === undefined) return "";
  if (grade === 0) return "体験";
  return `${CATEGORY_PREFIX[normalizeCategory(category)]}${grade}`;
}

// 学年ドロップダウンの選択肢（体験＋1..max）
export function gradeOptions(category: string | null | undefined): { value: number; label: string }[] {
  const cat = normalizeCategory(category);
  const opts: { value: number; label: string }[] = [{ value: 0, label: "体験生" }];
  for (let g = 1; g <= CATEGORY_MAX_GRADE[cat]; g++) {
    opts.push({ value: g, label: `${CATEGORY_PREFIX[cat]}${g}` });
  }
  return opts;
}

// 卒団学年（この学年の選手は進級で卒団扱い）
export function graduatingGrade(category: string | null | undefined): number {
  return CATEGORY_MAX_GRADE[normalizeCategory(category)];
}
