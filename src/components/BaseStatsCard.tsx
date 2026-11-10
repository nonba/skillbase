"use client";

import { useEffect, useState } from "react";

// 「SCOREBASE から送られた成績」(試作・2026-11-11)。土台(HOMEBASE)の個人成績を、本人の分だけ、読んで出す。
// BASE アカウントと結ばれていない人には、つなぐ案内を出す。保存はしない(成績の正は土台)。
// 子どもの成績なので、「見られるのは、本人・保護者・指導者だけ」と書く。試合が少ないうちは、数字がぶれるので「目安」と添える(順位づけはしない)。

interface Game {
  id: string;
  title: string;
  date: string;
  matchType: string | null;
}
interface BatRow {
  game: Game;
  atBats: number;
  hits: number;
  homeRuns: number;
  runsBattedIn: number;
  runs: number;
  strikeouts: number;
  walks: number;
  stolenBases: number;
}
interface PitRow {
  game: Game;
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
interface Player {
  userId: string;
  name: string;
  jerseyNumber?: string | null;
  batting: BatRow[];
  pitching: PitRow[];
}
type State = { kind: "loading" } | { kind: "unlinked" } | { kind: "hidden" } | { kind: "error"; text: string } | { kind: "ok"; players: Player[] };

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const innings = (outs: number) => `${Math.floor(outs / 3)}${outs % 3 ? "." + (outs % 3) : ""}`;

export default function BaseStatsCard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pick, setPick] = useState(0);

  useEffect(() => {
    fetch("/api/base/player-stats", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (j.linked === false) return setState({ kind: "unlinked" });
        if (j.hidden) return setState({ kind: "hidden" });
        if (!ok || j.error) return setState({ kind: "error", text: "成績を読み込めませんでした。時間をおいて、もう一度ためしてください。" });
        setState({ kind: "ok", players: (j.players as Player[]) ?? [] });
      })
      .catch(() => setState({ kind: "error", text: "成績を読み込めませんでした。通信を確かめてください。" }));
  }, []);

  if (state.kind === "loading") return null;
  const box = { padding: "16px" } as const;

  if (state.kind === "hidden") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📝 SCOREBASE の成績</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>選手の成績は、いまは、保護者と指導者が見られます。</p>
      </div>
    );
  }
  if (state.kind === "unlinked") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📝 SCOREBASE の成績</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "10px" }}>BASE アカウントとつなぐと、SCOREBASE で記録された、試合ごとの成績が、ここに出ます。</p>
        <a href="/dashboard/base-link" style={{ color: "var(--primary)", fontWeight: 700, fontSize: "13px" }}>→ BASE アカウントとつなぐ</a>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="card card-glass" style={box}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>📝 SCOREBASE の成績</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>{state.text}</p>
      </div>
    );
  }

  const players = state.players;
  const p = players[Math.min(pick, Math.max(players.length - 1, 0))] ?? null;
  const bat = p?.batting ?? [];
  const pit = p?.pitching ?? [];
  const tot = bat.reduce(
    (a, r) => ({ g: a.g + 1, ab: a.ab + r.atBats, h: a.h + r.hits, hr: a.hr + r.homeRuns, rbi: a.rbi + r.runsBattedIn, r: a.r + r.runs, so: a.so + r.strikeouts, bb: a.bb + r.walks, sb: a.sb + r.stolenBases }),
    { g: 0, ab: 0, h: 0, hr: 0, rbi: 0, r: 0, so: 0, bb: 0, sb: 0 }
  );
  const outs = pit.reduce((a, r) => a + r.outsPitched, 0);
  const avg = tot.ab > 0 ? (tot.h / tot.ab).toFixed(3).replace(/^0/, "") : "-";
  const th = { padding: "4px 6px", textAlign: "right" as const, fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" as const };
  const td = { padding: "4px 6px", textAlign: "right" as const, fontSize: "13px", whiteSpace: "nowrap" as const };

  return (
    <div className="card card-glass" style={box}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>📝 SCOREBASE の成績{p ? `（${p.name}）` : ""}</h3>
      {players.length > 1 && (
        <select className="input" value={Math.min(pick, players.length - 1)} onChange={(e) => setPick(Number(e.target.value))} style={{ maxWidth: "260px", marginBottom: "10px" }}>
          {players.map((x, i) => (
            <option key={x.userId} value={i}>{x.jerseyNumber ? `[${x.jerseyNumber}] ` : ""}{x.name}</option>
          ))}
        </select>
      )}
      <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px" }}>見られるのは、本人・保護者・指導者だけです。成績の元は、チームの SCOREBASE の記録です。</p>

      {players.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>見られる選手がいません（お子さんが、HOMEBASE のチームで、ひもづいていない可能性があります）。</p>
      ) : bat.length === 0 && pit.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>まだ、試合ごとの成績が送られていません。</p>
      ) : (
        <>
          {bat.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "12px", marginBottom: "6px" }}>
                {[["打率", avg], ["試合", tot.g], ["打数", tot.ab], ["安打", tot.h], ["本塁打", tot.hr], ["打点", tot.rbi], ["得点", tot.r], ["盗塁", tot.sb], ["三振", tot.so], ["四死球", tot.bb]].map(([l, v]) => (
                  <div key={l as string} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l}</div>
                    <div style={{ fontSize: "18px", fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
              {tot.g < 10 && <p style={{ fontSize: "11px", color: "#b45309", marginBottom: "10px" }}>まだ試合が少ないので（{tot.g}試合・{tot.ab}打数）、打率などは目安です。</p>}
              <div style={{ overflowX: "auto", marginBottom: "12px" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr><th style={{ ...th, textAlign: "left" }}>試合</th><th style={th}>打数</th><th style={th}>安打</th><th style={th}>本塁打</th><th style={th}>打点</th><th style={th}>得点</th><th style={th}>三振</th><th style={th}>四死球</th><th style={th}>盗塁</th></tr>
                  </thead>
                  <tbody>
                    {bat.map((r) => (
                      <tr key={r.game.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...td, textAlign: "left" }}>{fmtDate(r.game.date)} {r.game.title}</td><td style={td}>{r.atBats}</td><td style={td}>{r.hits}</td><td style={td}>{r.homeRuns}</td><td style={td}>{r.runsBattedIn}</td><td style={td}>{r.runs}</td><td style={td}>{r.strikeouts}</td><td style={td}>{r.walks}</td><td style={td}>{r.stolenBases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {pit.length > 0 && (
            <>
              <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "6px 0" }}>⚾ 投手（通算 {innings(outs)}回）</h4>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr><th style={{ ...th, textAlign: "left" }}>試合</th><th style={th}>回</th><th style={th}>被安打</th><th style={th}>失点</th><th style={th}>自責点</th><th style={th}>奪三振</th><th style={th}>与四死球</th><th style={th}>勝</th><th style={th}>敗</th></tr>
                  </thead>
                  <tbody>
                    {pit.map((r) => (
                      <tr key={r.game.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...td, textAlign: "left" }}>{fmtDate(r.game.date)} {r.game.title}</td><td style={td}>{innings(r.outsPitched)}</td><td style={td}>{r.hitsAllowed}</td><td style={td}>{r.runsAllowed}</td><td style={td}>{r.earnedRuns}</td><td style={td}>{r.strikeouts}</td><td style={td}>{r.walksAllowed}</td><td style={td}>{r.wins}</td><td style={td}>{r.losses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>勝・敗は、SCOREBASE の簡易判定（目安）です。</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
