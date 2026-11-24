"use client";

import { useState, useEffect } from "react";
import type { AiAnalysisResult, AnonymizedStatsPayload } from "@/lib/aiStatsAnalysis";

const CONSENT_STORAGE_KEY = "skillbase_ai_stats_consent_v1";

interface Props {
  stats: AnonymizedStatsPayload;
  label?: string;
}

export default function AiStatsAnalysisPanel({ stats, label = "AIで成績を分析" }: Props) {
  const [consented, setConsented] = useState(false);
  const [showConsentBox, setShowConsentBox] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AiAnalysisResult | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(CONSENT_STORAGE_KEY) === "1") {
        setConsented(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const runAnalysis = async (withConsent: boolean) => {
    if (!withConsent) {
      setShowConsentBox(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/analyze-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiConsent: true, stats }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || data?.error || "分析の取得に失敗しました。");
        return;
      }
      setResult(data.analysis);
      setShowConsentBox(false);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleAgreeAndAnalyze = () => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setConsented(true);
    void runAnalysis(true);
  };

  const handleRevokeConsent = () => {
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // ignore
    }
    setConsented(false);
    setResult(null);
    setShowConsentBox(false);
  };

  return (
    <div
      style={{
        marginTop: "14px",
        padding: "12px 14px",
        borderRadius: "10px",
        border: "1px solid rgba(59, 130, 246, 0.25)",
        background: "rgba(59, 130, 246, 0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
          <span>✨ AI 成績分析</span>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
            （{stats.source === "RECBASE" ? "RECBASE連携" : "手入力集計"} / 名前なし数値のみ）
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => void runAnalysis(consented)}
            style={{ padding: "6px 14px", fontSize: "12px", fontWeight: 700 }}
          >
            {loading ? "分析中..." : result ? "🔄 最新の数値で再分析" : `✨ ${label}`}
          </button>
          {consented && (
            <button
              type="button"
              onClick={handleRevokeConsent}
              style={{
                background: "none",
                border: "none",
                fontSize: "11px",
                color: "var(--text-muted)",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              送信同意を取り消す
            </button>
          )}
        </div>
      </div>

      {showConsentBox && !consented && (
        <div
          style={{
            marginTop: "10px",
            padding: "12px",
            borderRadius: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>🔒 外部AIへの送信確認（匿名データのみ）</div>
          <p style={{ margin: "0 0 8px", color: "var(--text-muted)" }}>
            AIによる成績分析を行うため、<strong>選手名・チーム名・生年月日などの個人情報は一切含めず</strong>、打撃・走塁・投球の集計数値のみを分析サービス（Anthropic Claude）へ送信します。
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAgreeAndAnalyze}
              style={{ padding: "6px 14px", fontSize: "12px" }}
            >
              同意して分析する
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowConsentBox(false)}
              style={{ padding: "6px 12px", fontSize: "12px" }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: "var(--danger)", fontSize: "12px", marginTop: "8px", marginBottom: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            borderRadius: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary)" }}>
              {result.mode === "claude" ? "🤖 Claude AI 分析" : "📊 ローカル試算プレビュー"}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{result.metricsNote}</span>
          </div>

          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, fontWeight: 600 }}>{result.summary}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", fontSize: "12px" }}>
            <div style={{ padding: "8px 10px", borderRadius: "6px", background: "rgba(46, 213, 115, 0.08)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px", color: "#15803d" }}>💪 強み</div>
              <ul style={{ margin: 0, paddingLeft: "16px", lineHeight: 1.5 }}>
                {result.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            <div style={{ padding: "8px 10px", borderRadius: "6px", background: "rgba(245, 158, 11, 0.08)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px", color: "#b45309" }}>🎯 伸びしろ・課題</div>
              <ul style={{ margin: 0, paddingLeft: "16px", lineHeight: 1.5 }}>
                {result.challenges.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>

            <div style={{ padding: "8px 10px", borderRadius: "6px", background: "rgba(59, 130, 246, 0.08)" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px", color: "#1d4ed8" }}>⚾ 次の練習ポイント</div>
              <ul style={{ margin: 0, paddingLeft: "16px", lineHeight: 1.5 }}>
                {result.nextPractice.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
