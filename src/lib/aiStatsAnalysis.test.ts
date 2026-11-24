import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeStatsWithAi,
  computeDerivedMetrics,
  sanitizeAnonymizedStats,
} from "./aiStatsAnalysis";

test("sanitizeAnonymizedStats strips personal fields and clamps negatives", () => {
  const cleaned = sanitizeAnonymizedStats({
    source: "SKILLBASE_SIMPLE",
    scope: "self",
    viewerRole: "PLAYER",
    gamesCount: 3,
    playerName: "山田太郎",
    teamName: "テスト少年野球団",
    batting: { ab: 10, hits: 4, bb: -2, so: 3, hr: 1 },
  });

  assert.equal("playerName" in cleaned, false);
  assert.equal("teamName" in cleaned, false);
  assert.equal(cleaned.batting?.bb, 0);
  assert.equal(cleaned.batting?.pa, 10);
});

test("computeDerivedMetrics calculates batting and pitching ratios accurately", () => {
  const payload = sanitizeAnonymizedStats({
    source: "RECBASE",
    scope: "team",
    viewerRole: "MANAGER",
    gamesCount: 4,
    batting: { pa: 25, ab: 20, hits: 8, doubles: 2, triples: 0, hr: 1, bb: 4, hbp: 1, so: 3 },
    pitching: { outs: 27, hits: 6, bb: 2, hbp: 0, so: 9, earned: 3 },
  });

  const m = computeDerivedMetrics(payload);
  assert.ok(m.batting);
  assert.equal(m.batting.avg.toFixed(3), "0.400");
  assert.ok(m.pitching);
  assert.equal(m.pitching.era.toFixed(2), "3.00");
  assert.equal(m.pitching.whip.toFixed(2), "0.89");
});

test("analyzeStatsWithAi falls back to local analysis when API key is missing", async () => {
  const payload = sanitizeAnonymizedStats({
    source: "SKILLBASE_SIMPLE",
    scope: "team",
    viewerRole: "MANAGER",
    gamesCount: 2,
    batting: { pa: 20, ab: 18, hits: 6, so: 6, bb: 2, risp_ab: 5, risp_hits: 2 },
  });

  const result = await analyzeStatsWithAi(payload, "");
  assert.equal(result.mode, "local");
  assert.equal(result.source, "SKILLBASE_SIMPLE");
  assert.ok(result.strengths.length >= 1);
  assert.ok(result.challenges.length >= 1);
  assert.ok(result.nextPractice.length >= 1);
});
