"use client";

import React from "react";

// 打席結果コードの日本語ラベル（観戦画面・入力画面で共用）
export const RESULT_LABELS: { [key: string]: string } = {
  SINGLE: "ヒット",
  DOUBLE: "二塁打",
  TRIPLE: "三塁打",
  HR: "ホームラン",
  WALK: "四死球",
  ERROR: "エラー出塁",
  SACRIFICE: "犠打",
  STRIKEOUT: "三振",
  GROUNDOUT: "ゴロアウト",
  FLYOUT: "フライアウト",
  OTHER_OUT: "アウト",
  DOUBLE_PLAY: "併殺打",
  TRIPLE_PLAY: "三重殺",
  // 打席によらない走塁イベント（batterIdなしで記録される）
  STEAL_HOME: "本盗ホームイン",
  OTHER_RUN: "暴投等で生還",
  CAUGHT_STEALING: "盗塁死",
  PICKOFF: "けん制死",
};

export const HIT_RESULT_CODES = ["SINGLE", "DOUBLE", "TRIPLE", "HR"];

export const countOuts = (res: string) => {
  // SACRIFICE (犠打・犠飛) も打者がアウトになるため1アウトとして数える
  // CAUGHT_STEALING / PICKOFF は「打者なしの走者アウト」— 回のアウト数に必ず数える
  if (["STRIKEOUT", "GROUNDOUT", "FLYOUT", "OTHER_OUT", "CAUGHT_STEALING", "PICKOFF", "SACRIFICE"].includes(res)) return 1;
  if (res === "DOUBLE_PLAY") return 2;
  if (res === "TRIPLE_PLAY") return 3;
  return 0;
};

interface LineScoreBoardProps {
  inningScores: any[];
  atBats: any[];
  isMyTeamBattingFirst: boolean;
  myScore: number;
  oppScore: number;
  opponentName?: string | null;
  currentInning?: number;
  maxInnings?: number;
  /** 指定するとイニング列がタップ可能になり、その回にドリルダウンできる */
  onInningClick?: (inning: number) => void;
  selectedInning?: number | null;
}

// 球場の電光掲示板風イニングスコア表。先攻チームが上段。
export default function LineScoreBoard({
  inningScores,
  atBats,
  isMyTeamBattingFirst,
  myScore,
  oppScore,
  opponentName,
  currentInning = 1,
  maxInnings = 7,
  onInningClick,
  selectedInning,
}: LineScoreBoardProps) {
  const maxInning = Math.max(maxInnings, currentInning, ...inningScores.map((s: any) => s.inningNumber));
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  const scoreOf = (n: number, mine: boolean) => {
    const s = inningScores.find((x: any) => x.inningNumber === n);
    const v = s ? (mine ? s.myRuns : s.oppRuns) : null;
    if (v !== null && v !== undefined) return v;
    // InningScoreは得点が入った時しか作られないため、打席記録があるイニングや進行中のイニングは0点と表示
    const isMyHalfTop = isMyTeamBattingFirst;
    const isThisHalfTop = mine ? isMyHalfTop : !isMyHalfTop;
    const halfPlayed = atBats.some((ab: any) =>
      ab.inningNumber === n && ab.isTopInning === isThisHalfTop
    );
    const isPastOrCurrent = n <= currentInning;
    return (halfPlayed || isPastOrCurrent) ? 0 : "-";
  };

  const rows = isMyTeamBattingFirst
    ? [
        { name: "自チーム", mine: true, total: myScore },
        { name: opponentName || "相手", mine: false, total: oppScore },
      ]
    : [
        { name: opponentName || "相手", mine: false, total: oppScore },
        { name: "自チーム", mine: true, total: myScore },
      ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "560px", background: "#14261c", borderRadius: "10px", overflow: "hidden", fontFamily: "'Courier New', monospace" }}>
        <thead>
          <tr>
            <th style={{ padding: "8px 12px", textAlign: "left", color: "#e8e0c8", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.15)", width: "80px", minWidth: "80px", maxWidth: "80px" }}>TEAM</th>
            {innings.map(n => (
              <th
                key={n}
                onClick={onInningClick ? () => onInningClick(n) : undefined}
                style={{
                  padding: "8px 6px",
                  color: selectedInning === n ? "#14261c" : "#e8e0c8",
                  background: selectedInning === n ? "#ffd75e" : "transparent",
                  fontSize: "12px",
                  borderBottom: "1px solid rgba(255,255,255,0.15)",
                  width: "36px",
                  cursor: onInningClick ? "pointer" : undefined,
                  textDecoration: onInningClick ? "underline" : undefined,
                }}
              >
                {n}
              </th>
            ))}
            <th style={{ padding: "8px 10px", color: "#ffd75e", fontSize: "12px", borderBottom: "1px solid rgba(255,255,255,0.15)", width: "44px" }}>R</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.name}>
              <td
                style={{
                  padding: "8px 12px",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "13px",
                  whiteSpace: "nowrap",
                  width: "80px",
                  minWidth: "80px",
                  maxWidth: "80px",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
                title={row.name}
              >
                {row.name}
              </td>
              {innings.map(n => (
                <td
                  key={n}
                  onClick={onInningClick ? () => onInningClick(n) : undefined}
                  style={{
                    padding: "8px 6px", textAlign: "center", fontSize: "15px", fontWeight: 700,
                    color: "#fff",
                    background: selectedInning === n ? "rgba(255, 215, 94, 0.15)" : "transparent",
                    cursor: onInningClick ? "pointer" : undefined,
                  }}
                >
                  {scoreOf(n, row.mine)}
                </td>
              ))}
              <td style={{ padding: "8px 10px", textAlign: "center", color: "#ffd75e", fontSize: "17px", fontWeight: 800 }}>{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
