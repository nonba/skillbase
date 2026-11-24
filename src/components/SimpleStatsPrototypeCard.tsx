"use client";

import { useState, useEffect } from "react";
import AiStatsAnalysisPanel from "@/components/AiStatsAnalysisPanel";

// SKILLBASE 単独チーム向け「成績を使う・使わない」選択 ＆ 試合ごとの個人結果の簡易入力（画面試作・2026-11-20）。
// オーナー要望(2026-11-20):
// ・「📋 チーム一括入力（Excel風テーブル）」と「👤 1人じっくり入力」の両方に対応。
// ・現状の集計・分析（base-stats: 打撃・走塁・投球）に絡む項目を網羅し、その中から「使う項目」をチェックボックスで自由に選べる。
// ・テンプレートとして「基本6項目（打数・安打・本塁打・打点・得点・盗塁）」等を用意し、ワンタップで切り替え＋個別チェック追加が可能。

export type StatCategory = "batting" | "running" | "pitching";

export interface StatFieldDef {
  key: StatKey;
  label: string;
  shortLabel: string;
  category: StatCategory;
  basic6?: boolean;
  standardBatRun?: boolean;
  hint?: string;
}

export type StatKey =
  // 打撃 (14)
  | "pa"
  | "ab"
  | "hits"
  | "doubles"
  | "triples"
  | "hr"
  | "rbi"
  | "bb"
  | "hbp"
  | "so"
  | "sh"
  | "sf"
  | "risp_ab"
  | "risp_hits"
  // 走塁 (9)
  | "runs"
  | "sb"
  | "cs"
  | "po"
  | "adv_wp"
  | "xbt_opp"
  | "xbt_ok"
  | "tag_opp"
  | "tag_ok"
  // 投手 (13)
  | "pit_innings"
  | "pit_thirds"
  | "pitches"
  | "batters"
  | "pit_hits"
  | "pit_hr"
  | "pit_so"
  | "pit_bb"
  | "pit_hbp"
  | "pit_runs"
  | "pit_earned"
  | "wp"
  | "balk";

export const ALL_STAT_FIELDS: StatFieldDef[] = [
  // ⚾ 打撃（base-stats.batting_game 対応）
  { key: "ab", label: "打数", shortLabel: "打数", category: "batting", basic6: true, standardBatRun: true },
  { key: "hits", label: "安打", shortLabel: "安打", category: "batting", basic6: true, standardBatRun: true },
  { key: "hr", label: "本塁打", shortLabel: "本塁打", category: "batting", basic6: true, standardBatRun: true },
  { key: "rbi", label: "打点", shortLabel: "打点", category: "batting", basic6: true, standardBatRun: true },
  { key: "pa", label: "打席", shortLabel: "打席", category: "batting", standardBatRun: true, hint: "未入力なら打数+四死球+犠打飛から自動計算" },
  { key: "doubles", label: "二塁打", shortLabel: "二塁打", category: "batting", standardBatRun: true, hint: "長打率・OPS計算に使用" },
  { key: "triples", label: "三塁打", shortLabel: "三塁打", category: "batting", standardBatRun: true, hint: "長打率・OPS計算に使用" },
  { key: "bb", label: "四球", shortLabel: "四球", category: "batting", standardBatRun: true, hint: "出塁率・選球眼分析に使用" },
  { key: "hbp", label: "死球", shortLabel: "死球", category: "batting", standardBatRun: true, hint: "出塁率計算に使用" },
  { key: "so", label: "三振", shortLabel: "三振", category: "batting", standardBatRun: true, hint: "三振率・コンタクト率分析に使用" },
  { key: "sh", label: "犠打", shortLabel: "犠打", category: "batting", standardBatRun: true },
  { key: "sf", label: "犠飛", shortLabel: "犠飛", category: "batting", standardBatRun: true, hint: "出塁率の分母に使用" },
  { key: "risp_ab", label: "得点圏打数", shortLabel: "得点圏打", category: "batting", standardBatRun: true, hint: "得点圏打率の分析に使用" },
  { key: "risp_hits", label: "得点圏安打", shortLabel: "得点圏安", category: "batting", standardBatRun: true, hint: "得点圏打率の分析に使用" },

  // 🏃 走塁（base-stats.running_game 対応）
  { key: "runs", label: "得点", shortLabel: "得点", category: "running", basic6: true, standardBatRun: true, hint: "生還率計算にも使用" },
  { key: "sb", label: "盗塁", shortLabel: "盗塁", category: "running", basic6: true, standardBatRun: true },
  { key: "cs", label: "盗塁死", shortLabel: "盗塁死", category: "running", standardBatRun: true, hint: "盗塁成功率の計算に使用" },
  { key: "po", label: "牽制死", shortLabel: "牽制死", category: "running" },
  { key: "adv_wp", label: "暴投/捕逸進塁", shortLabel: "WP進塁", category: "running" },
  { key: "xbt_opp", label: "余分進塁機会", shortLabel: "余分機会", category: "running", hint: "単打で1→3塁・2→本塁などの機会数" },
  { key: "xbt_ok", label: "余分進塁成功", shortLabel: "余分成功", category: "running", hint: "余分進塁率の分析に使用" },
  { key: "tag_opp", label: "タッチアップ機会", shortLabel: "TU機会", category: "running", hint: "0・1死3塁での外野フライ機会" },
  { key: "tag_ok", label: "タッチアップ生還", shortLabel: "TU成功", category: "running", hint: "タッチアップ成功率に使用" },

  // 🎯 投手（base-stats.pitching_game 対応）
  { key: "pit_innings", label: "投球回(整数)", shortLabel: "投球回", category: "pitching" },
  { key: "pit_thirds", label: "端数(.0/.1/.2)", shortLabel: "端数", category: "pitching", hint: "0=.0 / 1=1/3 / 2=2/3" },
  { key: "pitches", label: "球数", shortLabel: "球数", category: "pitching", hint: "1回あたり球数の分析に使用" },
  { key: "batters", label: "対戦打者", shortLabel: "打者", category: "pitching" },
  { key: "pit_hits", label: "被安打", shortLabel: "被安打", category: "pitching", hint: "WHIP・被打率に使用" },
  { key: "pit_hr", label: "被本塁打", shortLabel: "被本", category: "pitching" },
  { key: "pit_so", label: "奪三振", shortLabel: "奪三振", category: "pitching", hint: "奪三振率に使用" },
  { key: "pit_bb", label: "与四球", shortLabel: "与四球", category: "pitching", hint: "WHIP・制球分析に使用" },
  { key: "pit_hbp", label: "与死球", shortLabel: "与死球", category: "pitching" },
  { key: "pit_runs", label: "失点", shortLabel: "失点", category: "pitching" },
  { key: "pit_earned", label: "自責点", shortLabel: "自責点", category: "pitching", hint: "防御率の計算に使用" },
  { key: "wp", label: "暴投", shortLabel: "暴投", category: "pitching" },
  { key: "balk", label: "ボーク", shortLabel: "ボーク", category: "pitching" },
];

export const BASIC_6_KEYS: StatKey[] = ALL_STAT_FIELDS.filter((f) => f.basic6).map((f) => f.key);
export const STANDARD_BAT_RUN_KEYS: StatKey[] = ALL_STAT_FIELDS.filter((f) => f.standardBatRun).map((f) => f.key);
export const ALL_KEYS: StatKey[] = ALL_STAT_FIELDS.map((f) => f.key);

export type PlayerStatValues = Record<StatKey, number>;

export const emptyStatValues = (): PlayerStatValues =>
  Object.fromEntries(ALL_KEYS.map((k) => [k, 0])) as PlayerStatValues;

export interface RosterPlayerItem {
  id: string;
  name: string;
  jerseyNumber?: string | null;
}

interface SavedSimpleEntry {
  id: string;
  gameDate: string;
  opponentName: string;
  kind: "OFFICIAL" | "PRACTICE";
  tournament: string;
  playerId: string;
  playerName: string;
  jerseyNumber?: string | null;
  values: PlayerStatValues;
  source: "SKILLBASE_SIMPLE";
}

export default function SimpleStatsPrototypeCard({
  playerName,
  rosterPlayers = [],
}: {
  playerName?: string;
  rosterPlayers?: RosterPlayerItem[];
}) {
  const [useStats, setUseStats] = useState<boolean>(true);
  const [showColumnPicker, setShowColumnPicker] = useState<boolean>(false);
  const [selectedKeys, setSelectedKeys] = useState<StatKey[]>(BASIC_6_KEYS);

  const effectivePlayers: RosterPlayerItem[] =
    rosterPlayers.length > 0
      ? rosterPlayers
      : [
          { id: "p1", name: playerName || "山田 太郎", jerseyNumber: "1" },
          { id: "p2", name: "佐藤 健太", jerseyNumber: "6" },
          { id: "p3", name: "鈴木 翔太", jerseyNumber: "10" },
          { id: "p4", name: "高橋 蓮", jerseyNumber: "18" },
        ];

  const today = new Date().toISOString().slice(0, 10);
  const [gameDate, setGameDate] = useState(today);
  const [opponentName, setOpponentName] = useState("");
  const [kind, setKind] = useState<"OFFICIAL" | "PRACTICE">("PRACTICE");
  const [tournament, setTournament] = useState("");

  // 一括入力用: playerId -> PlayerStatValues
  const [gridValues, setGridValues] = useState<Record<string, PlayerStatValues>>({});
  // 個人入力用
  const [singlePlayerId, setSinglePlayerId] = useState<string>(effectivePlayers[0]?.id || "p1");
  const [singleValues, setSingleValues] = useState<PlayerStatValues>(emptyStatValues);

  // 保存済みプレビュー行
  const [entries, setEntries] = useState<SavedSimpleEntry[]>([]);

  useEffect(() => {
    setGridValues((prev) => {
      const next = { ...prev };
      for (const p of effectivePlayers) {
        if (!next[p.id]) next[p.id] = emptyStatValues();
      }
      return next;
    });
    if (!effectivePlayers.some((p) => p.id === singlePlayerId) && effectivePlayers[0]) {
      setSinglePlayerId(effectivePlayers[0].id);
    }
  }, [rosterPlayers.length]);

  const toggleKey = (key: StatKey) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const applyTemplate = (keys: StatKey[]) => {
    setSelectedKeys(keys);
  };

  // ALL_STAT_FIELDS の定義順に整列した有効カラム
  const activeFields = ALL_STAT_FIELDS.filter((f) => selectedKeys.includes(f.key));

  const updateGridCell = (playerId: string, key: StatKey, rawVal: number) => {
    const val = key === "pit_thirds" ? Math.min(2, Math.max(0, rawVal)) : Math.max(0, rawVal);
    setGridValues((prev) => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] ?? emptyStatValues()),
        [key]: val,
      },
    }));
  };

  const updateSingleCell = (key: StatKey, rawVal: number) => {
    const val = key === "pit_thirds" ? Math.min(2, Math.max(0, rawVal)) : Math.max(0, rawVal);
    setSingleValues((prev) => ({ ...prev, [key]: val }));
  };

  const hasNonZero = (v: PlayerStatValues) => ALL_KEYS.some((k) => (v[k] ?? 0) > 0);

  const normalizeValues = (v: PlayerStatValues): PlayerStatValues => {
    const autoPa = v.pa > 0 ? v.pa : v.ab + v.bb + v.hbp + v.sh + v.sf;
    return { ...v, pa: autoPa };
  };

  const handleSaveBulk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentName.trim()) return;
    const added: SavedSimpleEntry[] = [];
    for (const p of effectivePlayers) {
      const v = gridValues[p.id];
      if (!v || !hasNonZero(v)) continue;
      added.push({
        id: `sim-${Date.now()}-${p.id}`,
        gameDate,
        opponentName: opponentName.trim(),
        kind,
        tournament: tournament.trim(),
        playerId: p.id,
        playerName: p.name,
        jerseyNumber: p.jerseyNumber,
        values: normalizeValues(v),
        source: "SKILLBASE_SIMPLE",
      });
    }
    if (added.length === 0) {
      alert("少なくとも1人の選手の成績（1以上の数字）を入力してください。");
      return;
    }
    setEntries((prev) => [...added, ...prev]);
    // 入力セルをクリア
    const resetGrid: Record<string, PlayerStatValues> = {};
    for (const p of effectivePlayers) resetGrid[p.id] = emptyStatValues();
    setGridValues(resetGrid);
  };

  const handleSaveSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentName.trim()) return;
    if (!hasNonZero(singleValues)) {
      alert("少なくとも1つの項目に数字を入力してください。");
      return;
    }
    const p = effectivePlayers.find((x) => x.id === singlePlayerId) ?? effectivePlayers[0];
    const entry: SavedSimpleEntry = {
      id: `sim-${Date.now()}-${p.id}`,
      gameDate,
      opponentName: opponentName.trim(),
      kind,
      tournament: tournament.trim(),
      playerId: p.id,
      playerName: p.name,
      jerseyNumber: p.jerseyNumber,
      values: normalizeValues(singleValues),
      source: "SKILLBASE_SIMPLE",
    };
    setEntries((prev) => [entry, ...prev]);
    setSingleValues(emptyStatValues());
  };

  const calcRowSummary = (v: PlayerStatValues) => {
    const avg = v.ab > 0 ? (v.hits / v.ab).toFixed(3).replace(/^0/, "") : "-";
    const singles = Math.max(0, v.hits - v.doubles - v.triples - v.hr);
    const tb = singles + v.doubles * 2 + v.triples * 3 + v.hr * 4;
    const obpDen = v.ab + v.bb + v.hbp + v.sf;
    const obpNum = v.hits + v.bb + v.hbp;
    const ops =
      v.ab > 0 && obpDen > 0 ? (obpNum / obpDen + tb / v.ab).toFixed(3).replace(/^0/, "") : "-";
    const outs = v.pit_innings * 3 + v.pit_thirds;
    const ip = outs > 0 ? `${Math.floor(outs / 3)}.${outs % 3}` : "-";
    return { avg, ops, ip };
  };

  return (
    <div className="card card-glass" style={{ padding: "18px", border: "1px dashed var(--border)" }}>
      {/* ヘッダー＆使う/使わないトグル */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <div>
          <span className="badge" style={{ fontSize: "10px", marginBottom: "4px", display: "inline-block" }}>
            試作プレビュー（SKILLBASE 単独チーム向け）
          </span>
          <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0 }}>
            ✏️ 試合ごとの個人結果・簡易入力（一括Excel風 ／ 個人入力）
          </h3>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(0,0,0,0.04)", padding: "4px", borderRadius: "8px" }}>
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
          「成績を使わない」が選ばれています。この設定のチームでは成績機能をオフにし、コラム・野球ノート・タイムライン・DM のみで運用できます。
        </p>
      ) : (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "14px", lineHeight: 1.6 }}>
            使う項目だけをテンプレート＋チェックで選んで、<strong>Excel風の表から1人でもチーム全員でもそのまま入力</strong>できます。
            （※窓口の分離・チームの核の共通化後に BASE 共通DB <code>source: SKILLBASE_SIMPLE</code> へ保存されます）
          </p>

          {/* 項目カスタマイズ開閉 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 800 }}>
              📋 試合ごとの成績入力シート
            </div>

            <button
              type="button"
              onClick={() => setShowColumnPicker((v) => !v)}
              className="btn"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 700,
                background: showColumnPicker ? "var(--primary)" : "rgba(0,0,0,0.04)",
                color: showColumnPicker ? "#fff" : "var(--text-main)",
                border: "1px solid var(--border)",
              }}
            >
              ⚙️ 使う項目を選ぶ（現在 {activeFields.length} 項目） {showColumnPicker ? "▲" : "▼"}
            </button>
          </div>

          {/* 項目選択パネル（テンプレート＋チェックボックス） */}
          {showColumnPicker && (
            <div
              style={{
                background: "rgba(0,0,0,0.025)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "14px",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 800 }}>📌 テンプレートから一括選択（あとから個別チェックで足し引きOK）</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => applyTemplate(BASIC_6_KEYS)}
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      border: "1px solid var(--primary)",
                      background: selectedKeys.length === BASIC_6_KEYS.length ? "var(--primary)" : "transparent",
                      color: selectedKeys.length === BASIC_6_KEYS.length ? "#fff" : "var(--primary)",
                    }}
                  >
                    ⭐ 基本6項目（打数・安打・本塁打・打点・得点・盗塁）
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate(STANDARD_BAT_RUN_KEYS)}
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      border: "1px solid var(--border)",
                      background: "transparent",
                    }}
                  >
                    ⚾ 打撃・走塁しっかり（17項目）
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate(ALL_KEYS)}
                    className="btn"
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      border: "1px solid var(--border)",
                      background: "transparent",
                    }}
                  >
                    📊 フル項目（打撃＋走塁＋投手 36項目）
                  </button>
                </div>
              </div>

              {(
                [
                  ["batting", "⚾ 打撃項目（OPS・長打率・出塁率・三振率・得点圏打率の集計に連動）"],
                  ["running", "🏃 走塁項目（盗塁成功率・生還率・余分進塁率・タッチアップ成功率に連動）"],
                  ["pitching", "🎯 投手項目（防御率・球数効率・奪三振率・与四死球率・WHIPに連動）"],
                ] as [StatCategory, string][]
              ).map(([cat, title]) => (
                <div key={cat} style={{ marginTop: "10px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px" }}>{title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {ALL_STAT_FIELDS.filter((f) => f.category === cat).map((f) => {
                      const checked = selectedKeys.includes(f.key);
                      return (
                        <label
                          key={f.key}
                          title={f.hint || f.label}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 9px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: checked ? 700 : 500,
                            cursor: "pointer",
                            border: checked ? "1px solid var(--primary)" : "1px solid var(--border)",
                            background: checked ? "rgba(255, 107, 0, 0.12)" : "rgba(255, 255, 255, 0.5)",
                            color: checked ? "var(--primary)" : "var(--text-main)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleKey(f.key)}
                            style={{ accentColor: "var(--primary)", margin: 0 }}
                          />
                          {f.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 共通：試合の基本情報バー */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "10px",
              marginBottom: "14px",
              padding: "12px",
              background: "rgba(0,0,0,0.02)",
              borderRadius: "10px",
            }}
          >
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>試合日</label>
              <input type="date" className="input" value={gameDate} onChange={(e) => setGameDate(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>試合種別</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "OFFICIAL" | "PRACTICE")}>
                <option value="PRACTICE">練習試合</option>
                <option value="OFFICIAL">公式戦</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>対戦相手（必須）</label>
              <input
                type="text"
                className="input"
                placeholder="例: 青葉スターズ"
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>大会名（任意）</label>
              <input
                type="text"
                className="input"
                placeholder="例: 秋季大会"
                value={tournament}
                onChange={(e) => setTournament(e.target.value)}
              />
            </div>
          </div>

          {/* Excel風チーム一括入力 */}
          <form onSubmit={handleSaveBulk}>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "10px", marginBottom: "12px" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.04)", color: "var(--text-muted)" }}>
                      <th
                        style={{
                          position: "sticky",
                          left: 0,
                          background: "var(--surface, #fff)",
                          zIndex: 2,
                          padding: "8px 10px",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          borderBottom: "1px solid var(--border)",
                          borderRight: "1px solid var(--border)",
                        }}
                      >
                        選手名
                      </th>
                      {activeFields.map((f) => (
                        <th
                          key={f.key}
                          title={f.hint || f.label}
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            minWidth: "58px",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          {f.shortLabel}
                        </th>
                      ))}
                      <th
                        style={{
                          padding: "8px 8px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          borderBottom: "1px solid var(--border)",
                          borderLeft: "1px solid var(--border)",
                        }}
                      >
                        自動計算(打率/OPS)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectivePlayers.map((p) => {
                      const rowVal = gridValues[p.id] ?? emptyStatValues();
                      const sum = calcRowSummary(rowVal);
                      const activeRow = hasNonZero(rowVal);
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderTop: "1px solid var(--border)",
                            background: activeRow ? "rgba(255, 107, 0, 0.04)" : "transparent",
                          }}
                        >
                          <td
                            style={{
                              position: "sticky",
                              left: 0,
                              background: "var(--surface, #fff)",
                              zIndex: 1,
                              padding: "6px 10px",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              borderRight: "1px solid var(--border)",
                            }}
                          >
                            {p.jerseyNumber ? (
                              <span style={{ color: "var(--primary)", marginRight: "6px", fontSize: "11px" }}>
                                #{p.jerseyNumber}
                              </span>
                            ) : null}
                            {p.name}
                          </td>
                          {activeFields.map((f) => (
                            <td key={f.key} style={{ padding: "4px" }}>
                              {f.key === "pit_thirds" ? (
                                <select
                                  className="input"
                                  value={rowVal.pit_thirds}
                                  onChange={(e) => updateGridCell(p.id, "pit_thirds", Number(e.target.value))}
                                  style={{ padding: "4px 2px", fontSize: "12px", textAlign: "center", height: "30px" }}
                                >
                                  <option value={0}>.0</option>
                                  <option value={1}>.1</option>
                                  <option value={2}>.2</option>
                                </select>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  className="input"
                                  value={rowVal[f.key] === 0 ? "" : rowVal[f.key]}
                                  placeholder="0"
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) =>
                                    updateGridCell(p.id, f.key, e.target.value === "" ? 0 : Number(e.target.value))
                                  }
                                  style={{
                                    padding: "4px 4px",
                                    fontSize: "13px",
                                    textAlign: "center",
                                    height: "30px",
                                    width: "56px",
                                    margin: "0 auto",
                                    display: "block",
                                    fontWeight: rowVal[f.key] > 0 ? 800 : 400,
                                  }}
                                />
                              )}
                            </td>
                          ))}
                          <td
                            style={{
                              padding: "6px 8px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              borderLeft: "1px solid var(--border)",
                            }}
                          >
                            打率 <strong style={{ color: "var(--text-main)" }}>{sum.avg}</strong> / OPS{" "}
                            <strong style={{ color: "var(--text-main)" }}>{sum.ops}</strong>
                            {sum.ip !== "-" && ` / ${sum.ip}回`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  💡 Tabキーで右のセルへ連続入力できます（空欄は自動で 0 扱い、入力がある選手だけ保存されます）
                </span>
                <button type="submit" className="btn btn-primary" style={{ padding: "8px 20px", fontSize: "13px", fontWeight: 800 }}>
                  ＋ この試合の成績を追加（試作）
                </button>
              </div>
          </form>

          {/* 追加された試合ごとの成績プレビュー */}
          {entries.length > 0 && (
            <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 800 }}>
                  📊 簡易入力プレビュー（計 {entries.length} 件 / <code>source: SKILLBASE_SIMPLE</code>）
                </div>
                <button
                  type="button"
                  onClick={() => setEntries([])}
                  style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  クリア
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "right", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "5px 6px" }}>試合</th>
                      <th style={{ textAlign: "left", padding: "5px 6px" }}>選手</th>
                      {activeFields.map((f) => (
                        <th key={f.key} style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>
                          {f.shortLabel}
                        </th>
                      ))}
                      <th style={{ padding: "5px 6px", whiteSpace: "nowrap" }}>打率/OPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((ent) => {
                      const sum = calcRowSummary(ent.values);
                      return (
                        <tr key={ent.id} style={{ borderTop: "1px solid var(--border)", textAlign: "right" }}>
                          <td style={{ textAlign: "left", padding: "5px 6px", whiteSpace: "nowrap" }}>
                            {ent.gameDate} vs {ent.opponentName}
                          </td>
                          <td style={{ textAlign: "left", padding: "5px 6px", fontWeight: 700, whiteSpace: "nowrap" }}>
                            {ent.jerseyNumber ? `#${ent.jerseyNumber} ` : ""}
                            {ent.playerName}
                          </td>
                          {activeFields.map((f) => (
                            <td key={f.key} style={{ padding: "5px 6px" }}>
                              {f.key === "pit_thirds" ? `.${ent.values.pit_thirds}` : ent.values[f.key]}
                            </td>
                          ))}
                          <td style={{ padding: "5px 6px", whiteSpace: "nowrap", fontWeight: 700 }}>
                            {sum.avg} / {sum.ops}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <AiStatsAnalysisPanel
                label="手入力データからAI分析"
                stats={(() => {
                  const sum = (k: StatKey) => entries.reduce((acc, e) => acc + (e.values[k] || 0), 0);
                  const ab = sum("ab");
                  const bb = sum("bb");
                  const hbp = sum("hbp");
                  const sh = sum("sh");
                  const sf = sum("sf");
                  const pa = sum("pa") || ab + bb + hbp + sh + sf;
                  const outs = sum("pit_innings") * 3 + sum("pit_thirds");
                  return {
                    source: "SKILLBASE_SIMPLE" as const,
                    scope: "team" as const,
                    viewerRole: "MANAGER" as const,
                    gamesCount: new Set(entries.map((e) => `${e.gameDate}_${e.opponentName}`)).size || 1,
                    batting: {
                      pa,
                      ab,
                      hits: sum("hits"),
                      doubles: sum("doubles"),
                      triples: sum("triples"),
                      hr: sum("hr"),
                      rbi: sum("rbi"),
                      bb,
                      hbp,
                      so: sum("so"),
                      sh,
                      sf,
                      risp_ab: sum("risp_ab"),
                      risp_hits: sum("risp_hits"),
                    },
                    running: {
                      runs: sum("runs"),
                      sb: sum("sb"),
                      cs: sum("cs"),
                      po: sum("po"),
                      adv_wp: sum("adv_wp"),
                      xbt_opp: sum("xbt_opp"),
                      xbt_ok: sum("xbt_ok"),
                      tag_opp: sum("tag_opp"),
                      tag_ok: sum("tag_ok"),
                    },
                    pitching: {
                      outs,
                      pitches: sum("pitches"),
                      batters: sum("batters"),
                      hits: sum("pit_hits"),
                      hr: sum("pit_hr"),
                      so: sum("pit_so"),
                      bb: sum("pit_bb"),
                      hbp: sum("pit_hbp"),
                      runs: sum("pit_runs"),
                      earned: sum("pit_earned"),
                      wp: sum("wp"),
                      balk: sum("balk"),
                    },
                  };
                })()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
