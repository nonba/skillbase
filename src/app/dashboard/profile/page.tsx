"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { fetcher } from "@/lib/fetcher";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import AccountDeletionSection from "@/components/AccountDeletionSection";

export default function ProfilePage() {
  const { data: session } = useSession();
  const { data: profile, mutate } = useSWR(session?.user ? "/api/user/profile" : null, fetcher);
  const { data: statsRes } = useSWR(session?.user ? "/api/stats" : null, fetcher);

  const [activeTab, setActiveTab] = useState<"info" | "stats">("info");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [statsTargetId, setStatsTargetId] = useState<string>("");
  const [relationSaving, setRelationSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  // チームメンバー一覧の取得（親子紐づけ用）
  const { data: teamRes } = useSWR(session?.user ? "/api/team/info" : null, fetcher);
  const players = teamRes?.team?.members?.filter((u: any) => u.role === "PLAYER" && u.id !== session?.user?.id) || [];

  if (!profile) {
    return (
      <main className="container animate-fade-in" style={{ padding: "40px 24px" }}>
        <div className="skeleton skeleton-text" style={{ width: "200px", height: "32px", marginBottom: "24px" }}></div>
        <div className="card-glass skeleton-card" style={{ height: "200px" }}></div>
      </main>
    );
  }

  const handleLinkChild = async () => {
    if (!selectedChildId) return;
    setIsLinking(true);
    try {
      await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_child", childId: selectedChildId }),
      });
      mutate(); // プロフィール再取得
      setSelectedChildId("");
    } catch (error) {
      console.error(error);
      alert("紐づけに失敗しました。");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUpdateRelation = async (relation: string) => {
    setRelationSaving(true);
    try {
      await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_relation", relation }),
      });
      mutate();
    } catch (error) {
      console.error(error);
      alert("更新に失敗しました。");
    } finally {
      setRelationSaving(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setNameSaving(true);
    try {
      await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_name", name: trimmed }),
      });
      await mutate();
      setIsEditingName(false);
    } catch (error) {
      console.error(error);
      alert("名前の更新に失敗しました。");
    } finally {
      setNameSaving(false);
    }
  };

  const handleUnlinkChild = async (childId: string) => {
    if (!confirm("紐づけを解除しますか？")) return;
    try {
      await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink_child", childId }),
      });
      mutate();
    } catch (error) {
      console.error(error);
      alert("解除に失敗しました。");
    }
  };

  return (
    <main className="container animate-fade-in" style={{ padding: "40px 24px", maxWidth: "800px" }}>
      <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>👤 マイページ</h1>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="btn"
          style={{ background: "rgba(255, 71, 87, 0.1)", color: "var(--danger)", border: "1px solid var(--danger)", padding: "8px 16px", borderRadius: "var(--radius-sm)" }}
        >
          🚪 ログアウト
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", marginBottom: "24px", paddingBottom: "8px", overflowX: "auto" }}>
        <button
          className="btn"
          style={{ background: activeTab === "info" ? "var(--primary)" : "transparent", color: activeTab === "info" ? "#fff" : "var(--text-muted)", padding: "8px 16px" }}
          onClick={() => setActiveTab("info")}
        >
          基本情報
        </button>
        <button
          className="btn"
          style={{ background: activeTab === "stats" ? "var(--primary)" : "transparent", color: activeTab === "stats" ? "#fff" : "var(--text-muted)", padding: "8px 16px" }}
          onClick={() => setActiveTab("stats")}
        >
          個人成績
        </button>
      </div>

      {activeTab === "info" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* 基本情報・設定 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className="card card-glass">
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>基本情報</h2>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "12px", fontSize: "15px" }}>
              <div style={{ color: "var(--text-muted)" }}>氏名:</div>
              {isEditingName ? (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ maxWidth: "200px", padding: "6px 10px" }}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                  />
                  <button onClick={handleSaveName} disabled={nameSaving || !nameInput.trim()} className="btn btn-primary" style={{ padding: "4px 14px", fontSize: "13px" }}>
                    {nameSaving ? "保存中..." : "保存"}
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="btn" style={{ padding: "4px 14px", fontSize: "13px", background: "transparent", border: "1px solid var(--border)" }}>
                    キャンセル
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{profile.user.name}</span>
                  <button
                    onClick={() => { setNameInput(profile.user.name); setIsEditingName(true); }}
                    className="btn"
                    style={{ padding: "2px 10px", fontSize: "12px", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  >
                    編集
                  </button>
                </div>
              )}

              <div style={{ color: "var(--text-muted)" }}>メール:</div>
              <div>{profile.user.email}</div>
              
              <div style={{ color: "var(--text-muted)" }}>権限:</div>
              <div>
                <span className={`badge ${profile.user.role === "MANAGER" ? "badge-primary" : "badge-secondary"}`}>
                  {profile.user.role === "MANAGER" ? "指導者/管理者" : "選手/保護者"}
                </span>
              </div>

              {profile.user.jerseyNumber && (
                <>
                  <div style={{ color: "var(--text-muted)" }}>背番号:</div>
                  <div style={{ fontWeight: 700 }}>{profile.user.jerseyNumber}</div>
                </>
              )}
            </div>
            {/* 今後名前変更などのフォームを追加可能 */}

            {profile.user.role === "PARENT" && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "8px" }}>
                  続柄（グループ分け・連絡時の判別に使われます）:
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[
                    { value: "FATHER", label: "父" },
                    { value: "MOTHER", label: "母" },
                    { value: "OTHER", label: "その他" },
                  ].map((o) => {
                    const selected = profile.user.parentRelation === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={relationSaving}
                        onClick={() => handleUpdateRelation(o.value)}
                        style={{
                          padding: "8px 16px", borderRadius: "20px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                          border: selected ? "1px solid var(--primary)" : "1px solid var(--border)",
                          background: selected ? "var(--primary)" : "transparent",
                          color: selected ? "#fff" : "var(--text-muted)",
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="card card-glass">
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>通知設定</h2>
            <PushNotificationManager />
          </div>
        </div>

        {/* 家族・子供の紐づけ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "32px" }}>
          <div style={{ borderBottom: "2px solid var(--border)", paddingBottom: "8px", marginBottom: "8px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800 }}>👪 家族・子供の紐づけ</h2>
          </div>
          <div className="card card-glass">
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>紐づいている子供（選手）</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
              紐づけを行うと、アンケート回答時や成績確認時に子供の情報が表示されるようになります。
            </p>

            {profile.user.children && profile.user.children.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {profile.user.children.map((child: any) => (
                  <div key={child.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0, 0, 0, 0.02)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary)", color: "#ffffff", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
                        {child.jerseyNumber || "-"}
                      </div>
                      <span style={{ fontWeight: 600 }}>{child.name}</span>
                    </div>
                    <button onClick={() => handleUnlinkChild(child.id)} className="btn" style={{ background: "transparent", color: "var(--text-muted)", fontSize: "12px", border: "1px solid var(--border)" }}>
                      解除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "20px", textAlign: "center", background: "rgba(0, 0, 0, 0.02)", borderRadius: "8px", color: "var(--text-muted)" }}>
                紐づいている子供はいません。
              </div>
            )}
          </div>

          <div className="card card-glass">
            <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>新しく紐づける</h2>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <select
                className="input"
                style={{ flex: 1, minWidth: "200px" }}
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
              >
                <option value="">-- 選手を選択 --</option>
                {players.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.jerseyNumber ? `[${p.jerseyNumber}] ` : ""}{p.name}
                  </option>
                ))}
              </select>
              <button onClick={handleLinkChild} disabled={!selectedChildId || isLinking} className="btn btn-primary" style={{ padding: "0 24px" }}>
                {isLinking ? "処理中..." : "追加する"}
              </button>
            </div>
          </div>
        </div>

        {/* 危険な操作: アカウント削除 */}
        <div style={{ marginTop: "16px" }}>
          <AccountDeletionSection />
        </div>
        </div>
      )}

      {/* 個人成績 */}
      {activeTab === "stats" && (() => {
        const isPlayer = profile.user.role === "PLAYER";
        const children = profile.user.children || [];
        // 表示対象: 選手本人 / 保護者は選んだ子（未選択なら先頭の子）
        const targetId = isPlayer ? profile.user.id : (statsTargetId || children[0]?.id || "");
        const targetName = isPlayer ? profile.user.name : (children.find((c: any) => c.id === targetId)?.name || "");

        const battingRow = statsRes?.battingStats?.find((s: any) => s.userId === targetId);
        const pitchingRow = statsRes?.pitchingStats?.find((s: any) => s.userId === targetId);
        const hasPitching = pitchingRow && (Number(pitchingRow.inningsPitched) > 0 || pitchingRow.strikeouts > 0 || pitchingRow.wins > 0 || pitchingRow.losses > 0);

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={{ borderBottom: "2px solid var(--border)", paddingBottom: "8px", marginBottom: "8px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800 }}>📊 個人の成績</h2>
            </div>

            {!isPlayer && children.length > 1 && (
              <div className="card card-glass" style={{ padding: "16px" }}>
                <label className="form-label" style={{ fontSize: "13px" }}>お子さんを選択</label>
                <select className="input" value={targetId} onChange={(e) => setStatsTargetId(e.target.value)} style={{ maxWidth: "260px" }}>
                  {children.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.jerseyNumber ? `[${c.jerseyNumber}] ` : ""}{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {!isPlayer && children.length === 0 ? (
              <div className="card card-glass" style={{ textAlign: "center", padding: "40px 24px", color: "var(--text-muted)" }}>
                {profile.user.role === "MANAGER" ? (
                  <>
                    指導者アカウントです。チーム全体の成績は以下からご確認ください。<br />
                    <Link href="/dashboard/stats" style={{ display: "inline-block", marginTop: "12px", color: "var(--primary)", fontWeight: 600 }}>
                      → チーム全体の成績を見る
                    </Link>
                  </>
                ) : (
                  "お子さん（選手）が紐づいていません。「基本情報」タブから紐づけてください。"
                )}
              </div>
            ) : !statsRes ? (

              <div className="card card-glass" style={{ textAlign: "center", padding: "40px 24px", color: "var(--text-muted)" }}>
                読み込み中...
              </div>
            ) : (
              <>
                <div className="card card-glass">
                  <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>🏏 打撃成績{targetName ? `（${targetName}）` : ""}</h3>
                  {battingRow ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "16px" }}>
                      {[
                        ["打率", battingRow.avg],
                        ["打数", battingRow.atBats],
                        ["安打", battingRow.hits],
                        ["本塁打", battingRow.homeRuns],
                        ["打点", battingRow.runsBattedIn],
                        ["得点", battingRow.runs],
                        ["盗塁", battingRow.stolenBases],
                        ["三振", battingRow.strikeouts],
                        ["四球", battingRow.walks],
                      ].map(([label, value]) => (
                        <div key={label as string} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</div>
                          <div style={{ fontSize: "20px", fontWeight: 800 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>まだ記録がありません。</p>
                  )}
                </div>

                {hasPitching && (
                  <div className="card card-glass">
                    <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>⚾ 投手成績{targetName ? `（${targetName}）` : ""}</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "16px" }}>
                      {[
                        ["防御率", pitchingRow.era],
                        ["投球回", pitchingRow.inningsPitched],
                        ["奪三振", pitchingRow.strikeouts],
                        ["与四球", pitchingRow.walksAllowed],
                        ["失点", pitchingRow.runsAllowed],
                        ["自責点", pitchingRow.earnedRuns],
                        ["勝", pitchingRow.wins],
                        ["敗", pitchingRow.losses],
                        ["S", pitchingRow.saves],
                      ].map(([label, value]) => (
                        <div key={label as string} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</div>
                          <div style={{ fontSize: "20px", fontWeight: 800 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Link href="/dashboard/stats" style={{ fontSize: "13px", color: "var(--primary)", fontWeight: 600 }}>
                  → チーム全体の成績を見る
                </Link>
              </>
            )}
          </div>
        );
      })()}
    </main>
  );
}
