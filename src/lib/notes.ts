export const ACTIVITY_TYPES = [
  { value: "PRACTICE", label: "チーム練習", icon: "⚾", color: "#ff6b00" },
  { value: "GAME", label: "試合・遠征", icon: "🏆", color: "#eab308" },
  { value: "SELF", label: "自主練・素振り", icon: "💪", color: "#10b981" },
  { value: "OTHER", label: "座学・その他", icon: "📝", color: "#64748b" },
] as const;

export function getActivityTypeMeta(value?: string | null) {
  return ACTIVITY_TYPES.find((t) => t.value === value) || ACTIVITY_TYPES[0];
}

export const NOTE_CONDITIONS = [
  { value: "GREAT", label: "絶好調", icon: "😆", color: "#10b981" },
  { value: "GOOD", label: "良好", icon: "🙂", color: "#3b82f6" },
  { value: "TIRED", label: "疲労あり", icon: "💦", color: "#f59e0b" },
  { value: "PAIN", label: "張り・違和感あり", icon: "⚠️", color: "#ef4444" },
] as const;

export function getConditionMeta(value?: string | null) {
  return NOTE_CONDITIONS.find((c) => c.value === value) || NOTE_CONDITIONS[1];
}

export const COACH_STAMPS = [
  { value: "HANAMARU", label: "大変よくできました", icon: "💮", color: "#ef4444" },
  { value: "FIRE", label: "ナイス意識！", icon: "🔥", color: "#ff6b00" },
  { value: "THUMBSUP", label: "確認しました", icon: "👍", color: "#3b82f6" },
  { value: "FIGHT", label: "次も期待してるぞ！", icon: "💪", color: "#10b981" },
] as const;

export function getCoachStampMeta(value?: string | null) {
  return (value && COACH_STAMPS.find((s) => s.value === value)) || null;
}
