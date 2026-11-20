"use client";

import { useEffect, useState, useCallback } from "react";
import { isNativeApp } from "@/lib/platform";

// BASE 共有の成績データベース（base-stats / base-games）を読んで出すカード（2026-11-20 更新）。
// ・見せる範囲は BASE シリーズ準拠（self＝自分 ／ children＝ひもづけた子ども ／ team＝チーム全体）。
// ・選手本人（小学生を含む）も、自分の成績を見られる。
// ・試合が少ないうちは数字がぶれるため「目安」と添える（順位づけはしない）。
// ・ストアアプリ（iOS/Android）では契約の案内を出さない（Apple 3.1.1 準拠）。

type Scope = "self" | "children" | "team";
type KindFilter = "" | "OFFICIAL" | "PRACTICE";
type SubTab = "batting" | "running" | "pitching" | "games";

interface BasePlayerInfo {
  userId: string;
  name: string;
  jerseyNumber?: string | null;
}

interface BaseBattingTotal {
  user_id: string;
  games: number;
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  so: number;
  sh: number;
  sf: number;
  risp_ab: number;
  risp_hits: number;
}

interface BaseRunningTotal {
  user_id: string;
  games: number;
  sb: number;
  cs: number;
  po: number;
  oi: number;
  adv_wp: number;
  reaches: number;
  hr: number;
  runs: number;
  xbt_opp: number;
  xbt_ok: number;
  xbt_out: number;
  tag_opp: number;
  tag_ok: number;
  tag_out: number;
}

interface BasePitchingTotal {
  user_id: string;
  games: number;
  outs: number;
  pitches: number;
  batters: number;
  hits: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  runs: number;
  earned: number;
  wp: number;
  balk: number;
}

interface BaseGameSummary {
  rec_game_id: string;
  game_date: string | null;
  opponent_name: string | null;
  tournament: string | null;
  kind: string | null;
  round: string | null;
  venue: string | null;
  my_runs: number | null;
  opp_runs: number | null;
  status: string | null;
}

// 旧 /api/id/player-stats 互換用
interface LegacyGame {
  id: string;
  title: string;
  date: string;
  matchType: string | null;
}
interface LegacyBatRow {
  game: LegacyGame;
  atBats: number;
  hits: number;
  homeRuns: number;
  runsBattedIn: number;
  runs: number;
  strikeouts: number;
  walks: number;
  stolenBases: number;
}
interface LegacyPitRow {
  game: LegacyGame;
  inningsPitched: number;
  outsPitched: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  strikeouts: number;
  walksAllowed: number;
  wins: number;
  losses: number;
  saves: number;
}
interface LegacyPlayer extends BasePlayerInfo {
  batting?: LegacyBatRow[];
  pitching?: LegacyPitRow[];
}

type CardState =
  | { kind: "loading" }
  | { kind: "unlinked" }
  | { kind: "no-team" }
  | { kind: "plan" }
  | { kind: "forbidden" }
  | { kind: "error"; text: string }
  | {
      kind: "base-stats";
      scope: Scope;
      players: BasePlayerInfo[];
      batting: BaseBattingTotal[];
      running: BaseRunningTotal[];
      pitching: BasePitchingTotal[];
      games: BaseGameSummary[];
    }
  | {
      kind: "legacy";
      scope: Scope;
      players: LegacyPlayer[];
    };

const fmtRate = (num: number, den: number) => (den > 0 ? (num / den).toFixed(3).replace(/^0/, "") : "-");
const fmtPct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "-");
const fmtInnings = (outs: number) => `${Math.floor(outs / 3)}${outs % 3 ? "." + (outs % 3) : ""}`;
const fmtEra = (earned: number, outs: number) => (outs > 0 ? ((earned * 21) / outs).toFixed(2) : "-");
const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function BaseStatsCard() {
  const [state, setState] = useState<CardState>({ kind: "loading" });
  const [viewerRole, setViewerRole] = useState<string>("PLAYER");
  const [canViewTeam, setCanViewTeam] = useState<boolean>(true);
  const [scope, setScope] = useState<Scope | "">("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [subTab, setSubTab] = useState<SubTab>("batting");
  const [pick, setPick] = useState(0);

  const loadStats = useCallback((targetScope: Scope | "", targetKind: KindFilter) => {
    setState((prev) => (prev.kind === "loading" ? prev : { ...prev }));
    const sp = new URLSearchParams();
    if (targetScope) sp.set("scope", targetScope);
    if (targetKind) sp.set("kind", targetKind);
    const qs = sp.toString();

    fetch(`/api/base/player-stats${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (j.linked === false) return setState({ kind: "unlinked" });
        if (j.reason === "no-team") return setState({ kind: "no-team" });
        if (j.reason === "plan") return setState({ kind: "plan" });
        if (j.error === "forbidden") return setState({ kind: "forbidden" });
        if (!ok || j.error) {
          return setState({
            kind: "error",
            text: "成績を読み込めませんでした。時間をおいて、もう一度ためしてください。",
          });
        }
        if (typeof j.role === "string") setViewerRole(j.role);
        if (typeof j.canViewTeam === "boolean") setCanViewTeam(j.canViewTeam);
        const resolvedScope: Scope = j.scope ?? (targetScope || "self");
        if (!targetScope) setScope(resolvedScope);

        if (j.source === "base-stats") {
          setState({
            kind: "base-stats",
            scope: resolvedScope,
            players: (j.players as BasePlayerInfo[]) ?? [],
            batting: (j.batting as BaseBattingTotal[]) ?? [],
            running: (j.running as BaseRunningTotal[]) ?? [],
            pitching: (j.pitching as BasePitchingTotal[]) ?? [],
            games: (j.games as BaseGameSummary[]) ?? [],
          });
        } else {
          setState({
            kind: "legacy",
            scope: resolvedScope,
            players: (j.players as LegacyPlayer[]) ?? [],
          });
        }
      })
      .catch(() =>
        setState({ kind: "error", text: "成績を読み込めませんでした。通信を確かめてください。" })
      );
  }, []);

  useEffect(() => {
    loadStats(scope, kindFilter);
  }, [scope, kindFilter, loadStats]);

  if (state.kind === "loading") {
    return (
      <div className="card card-glass" style={{ padding: "16px" }}>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>成績を読み込んでいます…</p>
      </div>
    );
  }

  const box = { padding: "16px" } as const;

  if (state.kind === "unlinked") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📊 BASE 共通の成績</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "10px", lineHeight: 1.7 }}>
          BASE アカウントとつなぐと、SCOREBASE で記録された試合ごとの成績や通算成績が、ここに出ます。
        </p>
        <a href="/dashboard/base-link" style={{ color: "var(--primary)", fontWeight: 700, fontSize: "13px" }}>
          → BASE アカウントとつなぐ
        </a>
      </div>
    );
  }

  if (state.kind === "no-team") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📊 BASE 共通の成績</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
          お使いの BASE アカウントは、まだ BASE 共通のチームにひもづいていません。チームからの招待を受けると、ここに成績が表示されます。
        </p>
      </div>
    );
  }

  if (state.kind === "plan") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📊 BASE 共通の成績</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
          {isNativeApp()
            ? "現在、表示できる成績データがありません。"
            : "このチームでは、まだ SCOREBASE との成績連携が有効になっていません。チームで成績連携を有効にするか、SKILLBASE の簡易成績入力（試作）をご利用ください。"}
        </p>
      </div>
    );
  }

  // ログイン中の立場（role）とチームの閲覧権限設定（canViewTeam）に合わせてボタンを出し分ける:
  // ・PLAYER（選手本人）: 「自分の成績」＋（チーム全体公開が許可されているときだけ）「チーム全体」
  // ・PARENT（保護者）: 「お子さんの成績」＋（チーム全体公開が許可されているときだけ）「チーム全体」
  // ・MANAGER（指導者）: 「チーム全体」「お子さんの成績」
  const rawScopeOptions: [Scope, string][] =
    viewerRole === "PLAYER"
      ? [
          ["self", "自分の成績"],
          ["team", "チーム全体"],
        ]
      : viewerRole === "PARENT"
        ? [
            ["children", "お子さんの成績"],
            ["team", "チーム全体"],
          ]
        : [
            ["team", "チーム全体"],
            ["children", "お子さんの成績"],
          ];
  const scopeOptions = rawScopeOptions.filter(([sc]) => sc !== "team" || canViewTeam);

  const scopeBar = (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
      <div style={{ display: "flex", gap: "4px", background: "rgba(0,0,0,0.04)", padding: "3px", borderRadius: "8px" }}>
        {scopeOptions.map(([sc, label]) => {
          const active = (scope || scopeOptions[0][0]) === sc;
          return (
            <button
              key={sc}
              type="button"
              onClick={() => {
                setPick(0);
                setScope(sc);
              }}
              style={{
                padding: "5px 10px",
                fontSize: "12px",
                fontWeight: 700,
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                background: active ? "var(--primary)" : "transparent",
                color: active ? "#fff" : "var(--text-muted)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {state.kind === "base-stats" && (
        <select
          className="input"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as KindFilter)}
          style={{ width: "auto", padding: "4px 10px", fontSize: "12px", height: "32px" }}
        >
          <option value="">すべての試合</option>
          <option value="OFFICIAL">公式戦のみ</option>
          <option value="PRACTICE">練習試合のみ</option>
        </select>
      )}
    </div>
  );

  if (state.kind === "forbidden") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📊 BASE 共通の成績</h3>
        {scopeBar}
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
          この範囲の成績を見る権限がありません（チームの閲覧権限の設定に準じます）。「自分」または「お子さん」を選んでください。
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📊 BASE 共通の成績</h3>
        {scopeBar}
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>{state.text}</p>
      </div>
    );
  }

  // ===== 新窓口: base-stats + base-games =====
  if (state.kind === "base-stats") {
    const { players, batting, running, pitching, games } = state;
    const idx = Math.min(pick, Math.max(players.length - 1, 0));
    const currentPlayer = players[idx] ?? null;
    const uid = currentPlayer?.userId ?? "";

    const bat = batting.find((b) => b.user_id === uid);
    const run = running.find((r) => r.user_id === uid);
    const pit = pitching.find((p) => p.user_id === uid);

    const hasAnyStats = Boolean(bat || run || pit);

    return (
      <div className="card card-glass" style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
            📊 BASE 共通の成績{currentPlayer ? `（${currentPlayer.name}）` : ""}
          </h3>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            閲覧範囲はチームの BASE 設定に準じます
          </span>
        </div>

        {scopeBar}

        {players.length > 1 && (
          <div style={{ marginBottom: "12px" }}>
            <select
              className="input"
              value={idx}
              onChange={(e) => setPick(Number(e.target.value))}
              style={{ maxWidth: "280px" }}
            >
              {players.map((x, i) => (
                <option key={x.userId} value={i}>
                  {x.jerseyNumber ? `[${x.jerseyNumber}] ` : ""}
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* サブタブ（打撃・走塁・投手・試合一覧） */}
        <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "14px", overflowX: "auto" }}>
          {(
            [
              ["batting", "⚾ 打撃"],
              ["running", "🏃 走塁"],
              ["pitching", "🎯 投手"],
              ["games", `📅 試合一覧 (${games.length})`],
            ] as [SubTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 700,
                borderRadius: "6px",
                border: subTab === key ? "1px solid var(--primary)" : "1px solid var(--border)",
                background: subTab === key ? "rgba(255, 107, 0, 0.12)" : "transparent",
                color: subTab === key ? "var(--primary)" : "var(--text-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === "games" ? (
          games.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
              まだ、条件に合う試合の記録が送られていません。
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", fontSize: "11px", textAlign: "left" }}>
                    <th style={{ padding: "6px" }}>日付</th>
                    <th style={{ padding: "6px" }}>種別</th>
                    <th style={{ padding: "6px" }}>対戦相手 / 大会</th>
                    <th style={{ padding: "6px", textAlign: "right" }}>結果</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.rec_game_id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{fmtDate(g.game_date)}</td>
                      <td style={{ padding: "6px", whiteSpace: "nowrap" }}>
                        <span className="badge" style={{ fontSize: "10px", padding: "2px 6px" }}>
                          {g.kind === "OFFICIAL" ? "公式戦" : g.kind === "PRACTICE" ? "練習試合" : "試合"}
                        </span>
                      </td>
                      <td style={{ padding: "6px" }}>
                        <div style={{ fontWeight: 700 }}>{g.opponent_name || "対戦相手未設定"}</div>
                        {(g.tournament || g.round) && (
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {[g.tournament, g.round].filter(Boolean).join("・")}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "6px", textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>
                        {g.my_runs != null && g.opp_runs != null ? `${g.my_runs} - ${g.opp_runs}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : players.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
            {state.scope === "children"
              ? "ひもづいているお子さんの成績がまだありません（BASE 側でお子さんとの紐づけをご確認いただくか、試合記録の送信をお待ちください）。"
              : "まだ、試合の成績が送られていません。SCOREBASE から成績が送られると、ここに表示されます。"}
          </p>
        ) : !hasAnyStats ? (
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
            まだ、この選手の成績データが記録されていません。
          </p>
        ) : (
          <>
            {subTab === "batting" && (
              bat ? (
                <>
                  {(() => {
                    const singles = Math.max(0, bat.hits - bat.doubles - bat.triples - bat.hr);
                    const tb = singles + bat.doubles * 2 + bat.triples * 3 + bat.hr * 4;
                    const obpDen = bat.ab + bat.bb + bat.hbp + bat.sf;
                    const obpNum = bat.hits + bat.bb + bat.hbp;
                    const avg = fmtRate(bat.hits, bat.ab);
                    const obp = fmtRate(obpNum, obpDen);
                    const slg = fmtRate(tb, bat.ab);
                    const ops =
                      bat.ab > 0 && obpDen > 0
                        ? (obpNum / obpDen + tb / bat.ab).toFixed(3).replace(/^0/, "")
                        : "-";
                    const rispAvg = fmtRate(bat.risp_hits, bat.risp_ab);

                    return (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(82px, 1fr))", gap: "10px", marginBottom: "10px" }}>
                          {[
                            ["打率", avg],
                            ["出塁率", obp],
                            ["長打率", slg],
                            ["OPS", ops],
                            ["得点圏", rispAvg],
                            ["試合", bat.games],
                            ["打席", bat.pa],
                            ["打数", bat.ab],
                            ["安打", bat.hits],
                            ["二塁打", bat.doubles],
                            ["三塁打", bat.triples],
                            ["本塁打", bat.hr],
                            ["打点", bat.rbi],
                            ["四死球", bat.bb + bat.hbp],
                            ["三振", bat.so],
                            ["犠打飛", bat.sh + bat.sf],
                          ].map(([l, v]) => (
                            <div key={l as string} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(0,0,0,0.02)", borderRadius: "8px" }}>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l}</div>
                              <div style={{ fontSize: "17px", fontWeight: 800 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {bat.games < 10 && (
                          <p style={{ fontSize: "11px", color: "#b45309", margin: 0 }}>
                            ※まだ試合数が少ないため（{bat.games}試合・{bat.pa}打席）、打率やOPSなどは目安です。
                          </p>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>打撃の記録はまだありません。</p>
              )
            )}

            {subTab === "running" && (
              run ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(95px, 1fr))", gap: "10px" }}>
                  {[
                    ["盗塁", run.sb],
                    ["盗塁死", run.cs],
                    ["盗塁成功率", fmtPct(run.sb, run.sb + run.cs)],
                    ["得点", run.runs],
                    ["生還率", fmtPct(Math.max(0, run.runs - run.hr), Math.max(0, run.reaches - run.hr))],
                    ["余分進塁", `${run.xbt_ok}/${run.xbt_opp}`],
                    ["余分進塁率", fmtPct(run.xbt_ok, run.xbt_opp)],
                    ["タッチアップ", `${run.tag_ok}/${run.tag_opp}`],
                  ].map(([l, v]) => (
                    <div key={l as string} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(0,0,0,0.02)", borderRadius: "8px" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l}</div>
                      <div style={{ fontSize: "17px", fontWeight: 800 }}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>走塁の記録はまだありません。</p>
              )
            )}

            {subTab === "pitching" && (
              pit ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(85px, 1fr))", gap: "10px" }}>
                    {[
                      ["防御率(7回)", fmtEra(pit.earned, pit.outs)],
                      ["登板試合", pit.games],
                      ["投球回", fmtInnings(pit.outs)],
                      ["球数", pit.pitches],
                      ["打者", pit.batters],
                      ["被安打", pit.hits],
                      ["被本塁打", pit.hr],
                      ["奪三振", pit.so],
                      ["与四球", pit.bb],
                      ["与死球", pit.hbp],
                      ["失点", pit.runs],
                      ["自責点", pit.earned],
                    ].map(([l, v]) => (
                      <div key={l as string} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(0,0,0,0.02)", borderRadius: "8px" }}>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l}</div>
                        <div style={{ fontSize: "17px", fontWeight: 800 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>投手の記録はまだありません。</p>
              )
            )}
          </>
        )}
      </div>
    );
  }

  // ===== 旧 player-stats フォールバック表示 =====
  const players = state.players;
  const p = players[Math.min(pick, Math.max(players.length - 1, 0))] ?? null;
  const bat = p?.batting ?? [];
  const pit = p?.pitching ?? [];
  const tot = bat.reduce(
    (a, r) => ({
      g: a.g + 1,
      ab: a.ab + r.atBats,
      h: a.h + r.hits,
      hr: a.hr + r.homeRuns,
      rbi: a.rbi + r.runsBattedIn,
      r: a.r + r.runs,
      so: a.so + r.strikeouts,
      bb: a.bb + r.walks,
      sb: a.sb + r.stolenBases,
    }),
    { g: 0, ab: 0, h: 0, hr: 0, rbi: 0, r: 0, so: 0, bb: 0, sb: 0 }
  );
  const outs = pit.reduce((a, r) => a + r.outsPitched, 0);
  const avg = fmtRate(tot.h, tot.ab);
  const th = { padding: "4px 6px", textAlign: "right" as const, fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" as const };
  const td = { padding: "4px 6px", textAlign: "right" as const, fontSize: "13px", whiteSpace: "nowrap" as const };

  return (
    <div className="card card-glass" style={box}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>
        📊 BASE 共通の成績{p ? `（${p.name}）` : ""}
      </h3>
      {scopeBar}
      {players.length > 1 && (
        <select
          className="input"
          value={Math.min(pick, players.length - 1)}
          onChange={(e) => setPick(Number(e.target.value))}
          style={{ maxWidth: "260px", marginBottom: "10px" }}
        >
          {players.map((x, i) => (
            <option key={x.userId} value={i}>
              {x.jerseyNumber ? `[${x.jerseyNumber}] ` : ""}
              {x.name}
            </option>
          ))}
        </select>
      )}

      {players.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          見られる選手がいません（お子さんがチームでひもづいていない可能性があります）。
        </p>
      ) : bat.length === 0 && pit.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>まだ、試合ごとの成績が送られていません。</p>
      ) : (
        <>
          {bat.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "12px", marginBottom: "6px" }}>
                {[
                  ["打率", avg],
                  ["試合", tot.g],
                  ["打数", tot.ab],
                  ["安打", tot.h],
                  ["本塁打", tot.hr],
                  ["打点", tot.rbi],
                  ["得点", tot.r],
                  ["盗塁", tot.sb],
                  ["三振", tot.so],
                  ["四死球", tot.bb],
                ].map(([l, v]) => (
                  <div key={l as string} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l}</div>
                    <div style={{ fontSize: "18px", fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
              {tot.g < 10 && (
                <p style={{ fontSize: "11px", color: "#b45309", marginBottom: "10px" }}>
                  まだ試合が少ないので（{tot.g}試合・{tot.ab}打数）、打率などは目安です。
                </p>
              )}
              <div style={{ overflowX: "auto", marginBottom: "12px" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: "left" }}>試合</th>
                      <th style={th}>打数</th>
                      <th style={th}>安打</th>
                      <th style={th}>本塁打</th>
                      <th style={th}>打点</th>
                      <th style={th}>得点</th>
                      <th style={th}>三振</th>
                      <th style={th}>四死球</th>
                      <th style={th}>盗塁</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bat.map((r) => (
                      <tr key={r.game.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...td, textAlign: "left" }}>
                          {fmtDate(r.game.date)} {r.game.title}
                        </td>
                        <td style={td}>{r.atBats}</td>
                        <td style={td}>{r.hits}</td>
                        <td style={td}>{r.homeRuns}</td>
                        <td style={td}>{r.runsBattedIn}</td>
                        <td style={td}>{r.runs}</td>
                        <td style={td}>{r.strikeouts}</td>
                        <td style={td}>{r.walks}</td>
                        <td style={td}>{r.stolenBases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {pit.length > 0 && (
            <>
              <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "6px 0" }}>⚾ 投手（通算 {fmtInnings(outs)}回）</h4>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: "left" }}>試合</th>
                      <th style={th}>回</th>
                      <th style={th}>被安打</th>
                      <th style={th}>失点</th>
                      <th style={th}>自責点</th>
                      <th style={th}>奪三振</th>
                      <th style={th}>与四死球</th>
                      <th style={th}>勝</th>
                      <th style={th}>敗</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pit.map((r) => (
                      <tr key={r.game.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...td, textAlign: "left" }}>
                          {fmtDate(r.game.date)} {r.game.title}
                        </td>
                        <td style={td}>{fmtInnings(r.outsPitched)}</td>
                        <td style={td}>{r.hitsAllowed}</td>
                        <td style={td}>{r.runsAllowed}</td>
                        <td style={td}>{r.earnedRuns}</td>
                        <td style={td}>{r.strikeouts}</td>
                        <td style={td}>{r.walksAllowed}</td>
                        <td style={td}>{r.wins}</td>
                        <td style={td}>{r.losses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                勝・敗は、SCOREBASE の簡易判定（目安）です。
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
