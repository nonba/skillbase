/**
 * AI 成績分析のチーム別・ユーザー別レート制限（インメモリ版）。
 * ・特定のチームが連打しても、他チームの枠には影響しない（teamId ごとに分離）。
 * ・本番の複数PoP間で厳密な月間上限をかける場合は、将来 Durable Object（scorebase の OcrQuota 方式）等へ差し替え可能。
 */

export interface RateLimitDecision {
  allowed: boolean;
  reason?: "cooldown" | "user-hourly" | "team-daily";
  retryAfterSeconds?: number;
  message?: string;
}

interface TeamBucket {
  dayKey: string;
  count: number;
}

interface UserBucket {
  lastAt: number;
  hourKey: string;
  hourCount: number;
}

const teamBuckets = new Map<string, TeamBucket>();
const userBuckets = new Map<string, UserBucket>();

const USER_COOLDOWN_MS = 10_000; // 連打防止：10秒
const USER_HOURLY_LIMIT = 20; // 1ユーザーあたり 1時間20回
const TEAM_DAILY_LIMIT = 100; // 1チームあたり 1日100回（他チームとは完全分離）

function getDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function getHourKey(now: number): string {
  return new Date(now).toISOString().slice(0, 13);
}

export function checkAndConsumeAiRateLimit(
  userId: string,
  teamId?: string | null,
  now: number = Date.now()
): RateLimitDecision {
  const userKey = userId || "anonymous";
  const hourKey = getHourKey(now);
  const existingUser = userBuckets.get(userKey);

  if (existingUser) {
    const elapsed = now - existingUser.lastAt;
    if (elapsed < USER_COOLDOWN_MS) {
      const waitSec = Math.max(1, Math.ceil((USER_COOLDOWN_MS - elapsed) / 1000));
      return {
        allowed: false,
        reason: "cooldown",
        retryAfterSeconds: waitSec,
        message: `連続実行を防ぐため、${waitSec}秒ほど待ってからもう一度お試しください。`,
      };
    }
    if (existingUser.hourKey === hourKey && existingUser.hourCount >= USER_HOURLY_LIMIT) {
      return {
        allowed: false,
        reason: "user-hourly",
        retryAfterSeconds: 600,
        message: "1時間あたりのAI分析上限（20回）に達しました。少し時間を置いてお試しください。",
      };
    }
  }

  const effectiveTeamKey = teamId ? `team:${teamId}` : `solo:${userKey}`;
  const dayKey = getDayKey(now);
  const existingTeam = teamBuckets.get(effectiveTeamKey);
  if (existingTeam && existingTeam.dayKey === dayKey && existingTeam.count >= TEAM_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: "team-daily",
      retryAfterSeconds: 3600,
      message: "本日のチームAI分析の上限（100回）に達しました。明日またご利用ください。",
    };
  }

  // 消費を記録
  userBuckets.set(userKey, {
    lastAt: now,
    hourKey,
    hourCount: existingUser && existingUser.hourKey === hourKey ? existingUser.hourCount + 1 : 1,
  });

  teamBuckets.set(effectiveTeamKey, {
    dayKey,
    count: existingTeam && existingTeam.dayKey === dayKey ? existingTeam.count + 1 : 1,
  });

  return { allowed: true };
}

export function resetAiRateLimitForTest() {
  teamBuckets.clear();
  userBuckets.clear();
}
