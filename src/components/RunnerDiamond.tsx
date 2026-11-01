"use client";

import React from "react";

interface RunnerDiamondProps {
  /** 塁番号のカンマ区切り（例: "1,3"） */
  runners: string;
  /** 指定するとタップで塁のON/OFFができる（入力画面用）。省略時は表示専用（観戦画面用） */
  onToggle?: (base: "1" | "2" | "3") => void;
  size?: number;
}

// 塁上ランナーのダイヤモンド表示。2塁=上、3塁=左、1塁=右。
// タップ可能な場合、各塁は見た目より大きい当たり判定（最低44px）を持つ。
// runners は "1,3" 形式にも "1:userId,3:userId" 形式にも対応（塁番号部分だけ使う）。
export default function RunnerDiamond({ runners, onToggle, size = 72 }: RunnerDiamondProps) {
  const occupied = new Set(
    runners.split(",").map(s => s.split(":")[0]).filter(Boolean)
  );
  const baseSize = Math.round(size * 0.32);
  const hitArea = onToggle ? Math.max(44, baseSize + 16) : baseSize;

  const renderBase = (
    base: "1" | "2" | "3",
    pos: React.CSSProperties
  ) => (
    <div
      onClick={onToggle ? () => onToggle(base) : undefined}
      role={onToggle ? "button" : undefined}
      aria-label={onToggle ? `${base}塁ランナー${occupied.has(base) ? "あり" : "なし"}` : undefined}
      style={{
        position: "absolute",
        width: `${hitArea}px`,
        height: `${hitArea}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onToggle ? "pointer" : "default",
        WebkitTapHighlightColor: "transparent",
        ...pos,
      }}
    >
      <div
        style={{
          width: `${baseSize}px`,
          height: `${baseSize}px`,
          transform: "rotate(45deg)",
          borderRadius: "3px",
          background: occupied.has(base) ? "#e8a80c" : "var(--surface)",
          border: "2px solid " + (occupied.has(base) ? "#e8a80c" : "var(--text-muted)"),
          boxShadow: occupied.has(base) ? "0 0 8px rgba(232, 168, 12, 0.6)" : "none",
          transition: "all 0.12s",
        }}
      />
    </div>
  );

  const w = size + (onToggle ? 24 : 0);
  const h = Math.round(size * 0.72) + (onToggle ? 24 : 0);

  return (
    <div style={{ position: "relative", width: `${w}px`, height: `${h}px`, flexShrink: 0 }}>
      {/* 2塁（上・中央） */}
      {renderBase("2", { top: 0, left: "50%", marginLeft: `-${hitArea / 2}px` })}
      {/* 3塁（左・下） */}
      {renderBase("3", { bottom: 0, left: 0 })}
      {/* 1塁（右・下） */}
      {renderBase("1", { bottom: 0, right: 0 })}
    </div>
  );
}
