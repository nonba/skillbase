export type AnalysisSource = "RECBASE" | "SKILLBASE_SIMPLE";
export type AnalysisScope = "self" | "children" | "team";
export type ViewerRole = "PLAYER" | "PARENT" | "MANAGER";

export interface BattingSummaryInput {
  pa?: number;
  ab?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  hr?: number;
  rbi?: number;
  bb?: number;
  hbp?: number;
  so?: number;
  sh?: number;
  sf?: number;
  risp_ab?: number;
  risp_hits?: number;
}

export interface RunningSummaryInput {
  runs?: number;
  sb?: number;
  cs?: number;
  po?: number;
  adv_wp?: number;
  xbt_opp?: number;
  xbt_ok?: number;
  tag_opp?: number;
  tag_ok?: number;
}

export interface PitchingSummaryInput {
  outs?: number;
  pitches?: number;
  batters?: number;
  hits?: number;
  hr?: number;
  so?: number;
  bb?: number;
  hbp?: number;
  runs?: number;
  earned?: number;
  wp?: number;
  balk?: number;
}

/** 将来の RECBASE 打席詳細（base-pa-summary）連携用の受け皿 */
export interface PaSummaryInput {
  gamesCount?: number;
  paCount?: number;
  byCount?: {
    firstPitch?: { pa?: number; ab?: number; hits?: number };
    twoStrikes?: { pa?: number; ab?: number; hits?: number; so?: number };
    aheadInCount?: { pa?: number; ab?: number; hits?: number; bb?: number };
  };
  byTrajectory?: Record<string, { pa?: number; ab?: number; hits?: number; sh?: number }>;
  byCourse?: { left?: number; center?: number; right?: number };
  risp?: { ab?: number; hits?: number; rbi?: number };
}

export interface AnonymizedStatsPayload {
  source: AnalysisSource;
  scope: AnalysisScope;
  viewerRole: ViewerRole;
  gamesCount: number;
  batting?: Required<BattingSummaryInput>;
  running?: Required<RunningSummaryInput>;
  pitching?: Required<PitchingSummaryInput>;
  paSummary?: PaSummaryInput;
}

export interface AiAnalysisResult {
  mode: "claude" | "local";
  source: AnalysisSource;
  summary: string;
  strengths: string[];
  challenges: string[];
  nextPractice: string[];
  metricsNote: string;
}

function n(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(Math.floor(num), 100000);
}

/** 名前・チーム名・個人情報を一切含まない数値のみの入力に正規化する */
export function sanitizeAnonymizedStats(raw: unknown): AnonymizedStatsPayload {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const source: AnalysisSource = obj.source === "RECBASE" ? "RECBASE" : "SKILLBASE_SIMPLE";
  const scope: AnalysisScope =
    obj.scope === "children" ? "children" : obj.scope === "team" ? "team" : "self";
  const viewerRole: ViewerRole =
    obj.viewerRole === "MANAGER" ? "MANAGER" : obj.viewerRole === "PARENT" ? "PARENT" : "PLAYER";

  const gamesCount = n(obj.gamesCount);
  const out: AnonymizedStatsPayload = { source, scope, viewerRole, gamesCount };

  if (obj.batting && typeof obj.batting === "object") {
    const b = obj.batting as Record<string, unknown>;
    const ab = n(b.ab);
    const bb = n(b.bb);
    const hbp = n(b.hbp);
    const sh = n(b.sh);
    const sf = n(b.sf);
    const pa = n(b.pa) || ab + bb + hbp + sh + sf;
    out.batting = {
      pa,
      ab,
      hits: n(b.hits),
      doubles: n(b.doubles),
      triples: n(b.triples),
      hr: n(b.hr),
      rbi: n(b.rbi),
      bb,
      hbp,
      so: n(b.so),
      sh,
      sf,
      risp_ab: n(b.risp_ab),
      risp_hits: n(b.risp_hits),
    };
  }

  if (obj.running && typeof obj.running === "object") {
    const r = obj.running as Record<string, unknown>;
    out.running = {
      runs: n(r.runs),
      sb: n(r.sb),
      cs: n(r.cs),
      po: n(r.po),
      adv_wp: n(r.adv_wp),
      xbt_opp: n(r.xbt_opp),
      xbt_ok: n(r.xbt_ok),
      tag_opp: n(r.tag_opp),
      tag_ok: n(r.tag_ok),
    };
  }

  if (obj.pitching && typeof obj.pitching === "object") {
    const p = obj.pitching as Record<string, unknown>;
    out.pitching = {
      outs: n(p.outs),
      pitches: n(p.pitches),
      batters: n(p.batters),
      hits: n(p.hits),
      hr: n(p.hr),
      so: n(p.so),
      bb: n(p.bb),
      hbp: n(p.hbp),
      runs: n(p.runs),
      earned: n(p.earned),
      wp: n(p.wp),
      balk: n(p.balk),
    };
  }

  if (obj.paSummary && typeof obj.paSummary === "object") {
    const ps = obj.paSummary as PaSummaryInput;
    out.paSummary = {
      gamesCount: n(ps.gamesCount),
      paCount: n(ps.paCount),
      byCount: ps.byCount,
      byTrajectory: ps.byTrajectory,
      byCourse: ps.byCourse,
      risp: ps.risp,
    };
  }

  return out;
}

export function computeDerivedMetrics(payload: AnonymizedStatsPayload) {
  const b = payload.batting;
  const r = payload.running;
  const p = payload.pitching;

  const batting = b && (b.pa > 0 || b.ab > 0)
    ? (() => {
        const singles = Math.max(0, b.hits - b.doubles - b.triples - b.hr);
        const totalBases = singles + b.doubles * 2 + b.triples * 3 + b.hr * 4;
        const avg = b.ab > 0 ? b.hits / b.ab : 0;
        const obpDenom = b.ab + b.bb + b.hbp + b.sf;
        const obp = obpDenom > 0 ? (b.hits + b.bb + b.hbp) / obpDenom : 0;
        const slg = b.ab > 0 ? totalBases / b.ab : 0;
        const ops = obp + slg;
        const kRate = b.pa > 0 ? b.so / b.pa : 0;
        const bbRate = b.pa > 0 ? (b.bb + b.hbp) / b.pa : 0;
        const rispAvg = b.risp_ab > 0 ? b.risp_hits / b.risp_ab : null;
        return { avg, obp, slg, ops, kRate, bbRate, rispAvg };
      })()
    : null;

  const running = r && (r.sb + r.cs > 0 || r.xbt_opp > 0 || r.runs > 0)
    ? {
        sbSuccessRate: r.sb + r.cs > 0 ? r.sb / (r.sb + r.cs) : null,
        xbtRate: r.xbt_opp > 0 ? r.xbt_ok / r.xbt_opp : null,
      }
    : null;

  const pitching = p && p.outs > 0
    ? (() => {
        const innings = p.outs / 3;
        const era = (p.earned * 9) / innings;
        const whip = (p.hits + p.bb) / innings;
        const kPer9 = (p.so * 9) / innings;
        const bbPer9 = ((p.bb + p.hbp) * 9) / innings;
        return { innings, era, whip, kPer9, bbPer9 };
      })()
    : null;

  return { batting, running, pitching };
}

function fmt3(v: number): string {
  return v.toFixed(3).replace(/^0(?=\.)/, "");
}

/** APIキー未設定時・ローカル確認用の数値ベース分析フォールバック */
export function buildLocalStatsAnalysis(payload: AnonymizedStatsPayload): AiAnalysisResult {
  const m = computeDerivedMetrics(payload);
  const strengths: string[] = [];
  const challenges: string[] = [];
  const nextPractice: string[] = [];
  const notes: string[] = [];

  if (m.batting && payload.batting) {
    const b = payload.batting;
    notes.push(`打率 ${fmt3(m.batting.avg)} / 出塁率 ${fmt3(m.batting.obp)} / OPS ${m.batting.ops.toFixed(3)}`);
    if (m.batting.avg >= 0.3) {
      strengths.push(`打率 ${fmt3(m.batting.avg)} とミート力が高く、安定してヒットを打てています。`);
    } else if (m.batting.avg > 0 && m.batting.avg < 0.2 && b.ab >= 5) {
      challenges.push(`打率 ${fmt3(m.batting.avg)} のため、芯で捉える確率を上げる余地があります。`);
      nextPractice.push("ティー打撃でセンター返しを意識し、強いゴロやライナーを打つ練習を増やしましょう。");
    }

    if (m.batting.bbRate >= 0.12 && b.pa >= 5) {
      strengths.push(`四死球率 ${(m.batting.bbRate * 100).toFixed(0)}% と選球眼が良く、出塁に貢献できています。`);
    }
    if (m.batting.kRate >= 0.28 && b.pa >= 5) {
      challenges.push(`三振率 ${(m.batting.kRate * 100).toFixed(0)}% と三振がやや多めです。`);
      nextPractice.push("2ストライク後はコンパクトなスイングに切り替え、ファウルで粘る練習を取り入れましょう。");
    }
    if (m.batting.rispAvg !== null && b.risp_ab >= 3) {
      if (m.batting.rispAvg >= 0.3) {
        strengths.push(`得点圏打率 ${fmt3(m.batting.rispAvg)} とチャンスでしっかり結果を残せています。`);
      } else {
        challenges.push(`得点圏打率 ${fmt3(m.batting.rispAvg)} のため、チャンスの場面での落ち着きがテーマです。`);
        nextPractice.push("ランナー二・三塁を想定し、外野へ進塁打・犠飛を打つシチュエーション打撃を行いましょう。");
      }
    }
  }

  if (m.running && payload.running) {
    const r = payload.running;
    if (m.running.sbSuccessRate !== null) {
      notes.push(`盗塁 ${r.sb}/${r.sb + r.cs}（成功率 ${(m.running.sbSuccessRate * 100).toFixed(0)}%）`);
      if (m.running.sbSuccessRate >= 0.75) {
        strengths.push(`盗塁成功率 ${(m.running.sbSuccessRate * 100).toFixed(0)}% とスタート判断が優秀です。`);
      } else {
        challenges.push(`盗塁成功率 ${(m.running.sbSuccessRate * 100).toFixed(0)}% のため、スタートのタイミング改善が効果的です。`);
        nextPractice.push("投手の癖・牽制のタイミングを見る練習と、最初の3歩のダッシュを反復しましょう。");
      }
    }
    if (m.running.xbtRate !== null && r.xbt_opp >= 2 && m.running.xbtRate >= 0.6) {
      strengths.push(`次の塁を狙う意識が高く、積極的な走塁ができています。`);
    }
  }

  if (m.pitching && payload.pitching) {
    const p = payload.pitching;
    notes.push(`防御率 ${m.pitching.era.toFixed(2)} / WHIP ${m.pitching.whip.toFixed(2)}`);
    if (m.pitching.whip <= 1.2) {
      strengths.push(`WHIP ${m.pitching.whip.toFixed(2)} とランナーを出さずテンポ良く抑えられています。`);
    }
    if (m.pitching.bbPer9 >= 4.5) {
      challenges.push(`与四死球がやや多く（9回換算 ${m.pitching.bbPer9.toFixed(1)}）、球数が増えやすい傾向があります。`);
      nextPractice.push("キャッチボールから相手の胸へ真っすぐ投げる意識を強め、ストライク先行の投球を心がけましょう。");
    }
    if (m.pitching.kPer9 >= 7.0) {
      strengths.push(`奪三振率（9回換算 ${m.pitching.kPer9.toFixed(1)}）が高く、決め球が有効です。`);
    }
    if (p.wp >= 2) {
      challenges.push(`暴投（${p.wp}回）が見られるため、低めを投げる際のバランス確認がおすすめです。`);
    }
  }

  if (payload.paSummary && (payload.paSummary.paCount || 0) > 0) {
    notes.push(`打席詳細 ${payload.paSummary.paCount}打席`);
    const twoS = payload.paSummary.byCount?.twoStrikes;
    if (twoS && (twoS.pa || 0) >= 3 && (twoS.so || 0) / (twoS.pa || 1) >= 0.4) {
      challenges.push("2ストライクに追い込まれてからの三振割合が高めです。");
      nextPractice.push("早いカウントから積極的に打ちにいくか、追い込まれた後のノーステップ打法を試してみましょう。");
    }
  }

  if (strengths.length === 0 && challenges.length === 0) {
    return {
      mode: "local",
      source: payload.source,
      summary: "まだ分析できる試合数が少ないため、まずは1〜3試合分の記録を入力すると傾向が見えてきます。",
      strengths: ["記録を継続することで、打撃・走塁・投球の得意パターンが数値で把握できるようになります。"],
      challenges: ["試合数が増えるまでは「目安」として確認しましょう。"],
      nextPractice: ["基本項目（打数・安打・得点・盗塁など）から無理なく入力を続けてみてください。"],
      metricsNote: notes.join(" / ") || "データ蓄積中",
    };
  }

  if (strengths.length === 0) {
    strengths.push("試合経験を積みながらデータが着実に蓄積されています。");
  }
  if (challenges.length === 0) {
    challenges.push("大きな弱点は見当たらず、現在の良いバランスを維持できています。");
  }
  if (nextPractice.length === 0) {
    nextPractice.push("現在の強みを伸ばしつつ、試合後の野球ノートで「良かった打席・悔しかった打席」を1つ振り返りましょう。");
  }

  const sourceLabel = payload.source === "RECBASE" ? "RECBASE連携データ" : "手入力集計データ";
  const scopeLabel =
    payload.scope === "team" ? "チーム全体" : payload.scope === "children" ? "お子さま" : "個人";

  return {
    mode: "local",
    source: payload.source,
    summary: `${scopeLabel}の${sourceLabel}（${payload.gamesCount}試合）をもとに、数値の傾向を整理しました（ローカル試算プレビュー）。`,
    strengths,
    challenges,
    nextPractice,
    metricsNote: notes.join(" / ") || `${payload.gamesCount}試合`,
  };
}

const AI_ANALYSIS_TOOL = {
  name: "submit_baseball_analysis",
  description: "匿名化された野球成績の数値要約から、強み・課題・次の練習ポイントを返す。",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "全体の総評（2文以内、日本語）" },
      strengths: { type: "array", items: { type: "string" }, description: "強み（1〜3個）" },
      challenges: { type: "array", items: { type: "string" }, description: "課題・伸びしろ（1〜3個）" },
      nextPractice: { type: "array", items: { type: "string" }, description: "次の練習ポイント（1〜3個）" },
    },
    required: ["summary", "strengths", "challenges", "nextPractice"],
  },
};

function cleanList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, 3)
    .map((x) => x.trim().slice(0, 200));
}

/** Claude API（ANTHROPIC_API_KEY あり時）またはローカル試算で成績を分析する */
export async function analyzeStatsWithAi(
  payload: AnonymizedStatsPayload,
  anthropicApiKey?: string
): Promise<AiAnalysisResult> {
  const localFallback = buildLocalStatsAnalysis(payload);
  const key = (anthropicApiKey || "").trim();
  if (!key) {
    return localFallback;
  }

  const metrics = computeDerivedMetrics(payload);
  if (!metrics.batting && !metrics.running && !metrics.pitching) {
    return localFallback;
  }

  const roleHint =
    payload.viewerRole === "PLAYER"
      ? "選手本人（小中学生を含む）向けに、前向きで分かりやすい言葉で書いてください。"
      : payload.viewerRole === "PARENT"
      ? "保護者向けに、家庭での声かけや見守り方のヒントがわかるように書いてください。"
      : "指導者（監督・コーチ）向けに、練習メニューや声かけの視点で簡潔に書いてください。";

  const prompt = [
    "以下は匿名化された野球成績の数値要約です（個人名・チーム名は含まれません）。",
    roleHint,
    "試合数が少ない場合は「目安」である前提で、過度な断定を避けて分析してください。",
    JSON.stringify({ payload, metrics }),
  ].join("\n\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        tools: [AI_ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: AI_ANALYSIS_TOOL.name },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error("[AI_STATS_ANALYSIS] Claude API error:", res.status);
      return localFallback;
    }

    const data = (await res.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
    const block = data.content?.find((c) => c.type === "tool_use")?.input;
    if (!block) return localFallback;

    const summary = typeof block.summary === "string" ? block.summary.trim().slice(0, 300) : localFallback.summary;
    const strengths = cleanList(block.strengths);
    const challenges = cleanList(block.challenges);
    const nextPractice = cleanList(block.nextPractice);

    return {
      mode: "claude",
      source: payload.source,
      summary,
      strengths: strengths.length > 0 ? strengths : localFallback.strengths,
      challenges: challenges.length > 0 ? challenges : localFallback.challenges,
      nextPractice: nextPractice.length > 0 ? nextPractice : localFallback.nextPractice,
      metricsNote: localFallback.metricsNote,
    };
  } catch (err) {
    console.error("[AI_STATS_ANALYSIS] fetch failed:", err);
    return localFallback;
  }
}
