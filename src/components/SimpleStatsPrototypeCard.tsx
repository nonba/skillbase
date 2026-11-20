"use client";

import { useState } from "react";

// SKILLBASE 単独チーム向け「成績を使う・使わない」選択 ＆ 試合ごとの個人結果の簡易入力（画面試作・2026-11-20）。
// ※ 窓口の分離（NEXT_PREP_DESIGNS ①）とチームの核の共通化（BASE_ID_DESIGN 2.7）が決まるまでは、
//   サーバー・DB への書き込みは行わず、画面の使い勝手と項目粒度の確認用プロトタイプとして動作する。

interface SimpleGameRecord {
  id: string;
  gameDate: string;
  opponentName: string;
  kind: "OFFICIAL" | "PRACTICE";
  tournament: string;
  myRuns: string;
  oppRuns: string;
  // 打撃（基本）
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
  // 走塁
  runs: number;
  sb: number;
  cs: number;
  // 投球
  pitchedInnings: number;
  pitchedThirds: 0 | 1 | 2;
  pitches: number;
  pitHits: number;
  pitSo: number;
  pitBb: number;
  pitRuns: number;
  pitEarned: number;
  source: "SKILLBASE_SIMPLE";
}

export default function SimpleStatsPrototypeCard({ playerName }: { playerName?: string }) {
  const [useStats, setUseStats] = useState<boolean>(true);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [showDetailBat, setShowDetailBat] = useState<boolean>(false);
  const [showPitching, setShowPitching] = useState<boolean>(false);
  const [records, setRecords] = useState<SimpleGameRecord[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const [gameDate, setGameDate] = useState(today);
  const [opponentName, setOpponentName] = useState("");
  const [kind, setKind] = useState<"OFFICIAL" | "PRACTICE">("PRACTICE");
  const [tournament, setTournament] = useState("");
  const [myRuns, setMyRuns] = useState("");
  const [oppRuns, setOppRuns] = useState("");

  // 打撃
  const [pa, setPa] = useState(0);
  const [ab, setAb] = useState(0);
  const [hits, setHits] = useState(0);
  const [doubles, setDoubles] = useState(0);
  const [triples, setTriples] = useState(0);
  const [hr, setHr] = useState(0);
  const [rbi, setRbi] = useState(0);
  const [bb, setBb] = useState(0);
  const [hbp, setHbp] = useState(0);
  const [so, setSo] = useState(0);
  const [sh, setSh] = useState(0);
  const [sf, setSf] = useState(0);

  // 走塁
  const [runs, setRuns] = useState(0);
  const [sb, setSb] = useState(0);
  const [cs, setCs] = useState(0);

  // 投手
  const [pitchedInnings, setPitchedInnings] = useState(0);
  const [pitchedThirds, setPitchedThirds] = useState<0 | 1 | 2>(0);
  const [pitches, setPitches] = useState(0);
  const [pitHits, setPitHits] = useState(0);
  const [pitSo, setPitSo] = useState(0);
  const [pitBb, setPitBb] = useState(0);
  const [pitRuns, setPitRuns] = useState(0);
  const [pitEarned, setPitEarned] = useState(0);

  const handleAddRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentName.trim()) return;
    const effectivePa = pa > 0 ? pa : ab + bb + hbp + sh + sf;
    const newRec: SimpleGameRecord = {
      id: "sim-" + Date.now(),
      gameDate,
      opponentName: opponentName.trim(),
      kind,
      tournament: tournament.trim(),
      myRuns,
      oppRuns,
      pa: effectivePa,
      ab,
      hits,
      doubles,
      triples,
      hr,
      rbi,
      bb,
      hbp,
      so,
      sh,
      sf,
      runs,
      sb,
      cs,
      pitchedInnings,
      pitchedThirds,
      pitches,
      pitHits,
      pitSo,
      pitBb,
      pitRuns,
      pitEarned,
      source: "SKILLBASE_SIMPLE",
    };
    setRecords((prev) => [newRec, ...prev]);
    setOpponentName("");
    setTournament("");
    setMyRuns("");
    setOppRuns("");
    setPa(0);
    setAb(0);
    setHits(0);
    setDoubles(0);
    setTriples(0);
    setHr(0);
    setRbi(0);
    setBb(0);
    setHbp(0);
    setSo(0);
    setSh(0);
    setSf(0);
    setRuns(0);
    setSb(0);
    setCs(0);
    setPitchedInnings(0);
    setPitchedThirds(0);
    setPitches(0);
    setPitHits(0);
    setPitSo(0);
    setPitBb(0);
    setPitRuns(0);
    setPitEarned(0);
    setShowForm(false);
  };

  const numBox = (label: string, val: number, setVal: (n: number) => void) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>{label}</label>
      <input
        type="number"
        min={0}
        max={99}
        className="input"
        style={{ padding: "6px 8px", fontSize: "14px", textAlign: "center" }}
        value={val}
        onChange={(e) => setVal(Math.max(0, Number(e.target.value) || 0))}
      />
    </div>
  );

  const tot = records.reduce(
    (a, r) => ({
      g: a.g + 1,
      ab: a.ab + r.ab,
      h: a.h + r.hits,
      hr: a.hr + r.hr,
      rbi: a.rbi + r.rbi,
      r: a.r + r.runs,
      sb: a.sb + r.sb,
      outs: a.outs + r.pitchedInnings * 3 + r.pitchedThirds,
      pitSo: a.pitSo + r.pitSo,
      pitEarned: a.pitEarned + r.pitEarned,
    }),
    { g: 0, ab: 0, h: 0, hr: 0, rbi: 0, r: 0, sb: 0, outs: 0, pitSo: 0, pitEarned: 0 }
  );

  return (
    <div className="card card-glass" style={{ padding: "16px", border: "1px dashed var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
        <div>
          <span className="badge" style={{ fontSize: "10px", marginBottom: "4px", display: "inline-block" }}>
            試作プレビュー（SKILLBASE 単独チーム向け）
          </span>
          <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>
            ✏️ 試合ごとの個人結果・簡易入力{playerName ? `（${playerName}）` : ""}
          </h3>
        </div>

        {/* 成績を使う・使わない切り替え */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,0.04)", padding: "4px", borderRadius: "8px" }}>
          <button
            type="button"
            onClick={() => setUseStats(true)}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 700,
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              background: useStats ? "var(--primary)" : "transparent",
              color: useStats ? "#fff" : "var(--text-muted)",
            }}
          >
            成績を使う
          </button>
          <button
            type="button"
            onClick={() => setUseStats(false)}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 700,
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              background: !useStats ? "var(--text-muted)" : "transparent",
              color: !useStats ? "#fff" : "var(--text-muted)",
            }}
          >
            使わない
          </button>
        </div>
      </div>

      {!useStats ? (
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
          「成績を使わない」が選ばれています。この設定のチームでは成績欄を非表示にし、コラム・野球ノート・タイムライン・DM のみでシンプルに運用できます。
        </p>
      ) : (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.6 }}>
            SCOREBASE を使っていないチームでも、1試合ごとの個人の合計（打撃・走塁・投球）だけを簡単に記録できます（細かさは任意）。
            ※窓口の分離とチームの共通化が完了後に BASE 共通DB（<code>source: SKILLBASE_SIMPLE</code>）へ保存されます。
          </p>

          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn btn-primary"
              style={{ fontSize: "13px", padding: "8px 16px", fontWeight: 700 }}
            >
              ＋ 試合の個人結果を入力する（試作）
            </button>
          ) : (
            <form onSubmit={handleAddRecord} style={{ display: "flex", flexDirection: "column", gap: "14px", background: "rgba(0,0,0,0.02)", padding: "14px", borderRadius: "10px", marginBottom: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>試合日</label>
                  <input type="date" className="input" value={gameDate} onChange={(e) => setGameDate(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>種別</label>
                  <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "OFFICIAL" | "PRACTICE")}>
                    <option value="PRACTICE">練習試合</option>
                    <option value="OFFICIAL">公式戦</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>対戦相手（必須）</label>
                  <input type="text" className="input" placeholder="例: 青葉スターズ" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>大会名（任意）</label>
                  <input type="text" className="input" placeholder="例: 春季大会" value={tournament} onChange={(e) => setTournament(e.target.value)} />
                </div>
              </div>

              {/* 基本の打撃・走塁項目（これだけでもOK） */}
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>⚾ 基本成績（わかる項目だけでOK）</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(68px, 1fr))", gap: "8px" }}>
                  {numBox("打数", ab, setAb)}
                  {numBox("安打", hits, setHits)}
                  {numBox("本塁打", hr, setHr)}
                  {numBox("打点", rbi, setRbi)}
                  {numBox("得点", runs, setRuns)}
                  {numBox("盗塁", sb, setSb)}
                </div>
              </div>

              {/* 詳細項目トグル */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setShowDetailBat((v) => !v)}
                  style={{ fontSize: "12px", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}
                >
                  {showDetailBat ? "▲ 打撃・走塁の細かい項目を閉じる" : "▼ 打撃・走塁の細かい項目も入れる（二塁打・四死球・三振など）"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPitching((v) => !v)}
                  style={{ fontSize: "12px", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, padding: 0 }}
                >
                  {showPitching ? "▲ 投手成績を閉じる" : "▼ 投手成績も入れる（登板したとき）"}
                </button>
              </div>

              {showDetailBat && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(68px, 1fr))", gap: "8px" }}>
                  {numBox("打席", pa, setPa)}
                  {numBox("二塁打", doubles, setDoubles)}
                  {numBox("三塁打", triples, setTriples)}
                  {numBox("四球", bb, setBb)}
                  {numBox("死球", hbp, setHbp)}
                  {numBox("三振", so, setSo)}
                  {numBox("犠打", sh, setSh)}
                  {numBox("犠飛", sf, setSf)}
                  {numBox("盗塁死", cs, setCs)}
                </div>
              )}

              {showPitching && (
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>🎯 投手成績</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(76px, 1fr))", gap: "8px" }}>
                    {numBox("投球回(整数)", pitchedInnings, setPitchedInnings)}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>端数(回)</label>
                      <select
                        className="input"
                        style={{ padding: "6px 4px", fontSize: "13px" }}
                        value={pitchedThirds}
                        onChange={(e) => setPitchedThirds(Number(e.target.value) as 0 | 1 | 2)}
                      >
                        <option value={0}>.0</option>
                        <option value={1}>1/3 (.1)</option>
                        <option value={2}>2/3 (.2)</option>
                      </select>
                    </div>
                    {numBox("球数", pitches, setPitches)}
                    {numBox("被安打", pitHits, setPitHits)}
                    {numBox("奪三振", pitSo, setPitSo)}
                    {numBox("与四球", pitBb, setPitBb)}
                    {numBox("失点", pitRuns, setPitRuns)}
                    {numBox("自責点", pitEarned, setPitEarned)}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn"
                  style={{ fontSize: "13px", padding: "6px 14px", background: "transparent", border: "1px solid var(--border)" }}
                >
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: "13px", padding: "6px 18px", fontWeight: 700 }}>
                  追加してプレビュー
                </button>
              </div>
            </form>
          )}

          {records.length > 0 && (
            <div style={{ marginTop: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                試作入力プレビュー（{tot.g}試合 / 打率 {tot.ab > 0 ? (tot.h / tot.ab).toFixed(3).replace(/^0/, "") : "-"} / {tot.ab}打数{tot.h}安打 {tot.hr}本塁打 {tot.rbi}打点 {tot.sb}盗塁）
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "right" }}>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>試合</th>
                      <th style={{ padding: "4px 6px" }}>出どころ</th>
                      <th style={{ padding: "4px 6px" }}>打数</th>
                      <th style={{ padding: "4px 6px" }}>安打</th>
                      <th style={{ padding: "4px 6px" }}>本塁打</th>
                      <th style={{ padding: "4px 6px" }}>打点</th>
                      <th style={{ padding: "4px 6px" }}>盗塁</th>
                      <th style={{ padding: "4px 6px" }}>投球回</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--border)", textAlign: "right" }}>
                        <td style={{ textAlign: "left", padding: "4px 6px" }}>
                          {r.gameDate} vs {r.opponentName}
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          <span className="badge" style={{ fontSize: "10px", padding: "1px 6px" }}>
                            簡易入力 (合計のみ)
                          </span>
                        </td>
                        <td style={{ padding: "4px 6px" }}>{r.ab}</td>
                        <td style={{ padding: "4px 6px" }}>{r.hits}</td>
                        <td style={{ padding: "4px 6px" }}>{r.hr}</td>
                        <td style={{ padding: "4px 6px" }}>{r.rbi}</td>
                        <td style={{ padding: "4px 6px" }}>{r.sb}</td>
                        <td style={{ padding: "4px 6px" }}>
                          {r.pitchedInnings > 0 || r.pitchedThirds > 0 ? `${r.pitchedInnings}.${r.pitchedThirds}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
