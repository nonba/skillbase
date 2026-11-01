"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { QRCodeCanvas } from "qrcode.react";
import { getFreeTrialEndDate, isWithinSignupFreeTrial } from "@/lib/billing";
import StartTrialButton from "@/components/StartTrialButton";
import EndTrialButton from "@/components/EndTrialButton";
import { isNativeApp } from "@/lib/platform";

interface TeamData {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  maxUsers: number;
  scorePlan: string;
  createdAt: string;
  tier: string;
  homebaseTrialStartedAt: string | null;
}

export default function SettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  // revalidateOnFocus:false — タブ切り替え(会費Pay管理画面等)から戻るたびに自動再取得され、
  // 保存前のプラン選択(maxUsers/scorePlan/addPacks等)がuseEffectでリセットされてしまうのを防ぐ。
  // 保存・課金操作後の明示的なmutateTeam()呼び出しでは引き続き最新化される。
  const { data: teamRes, mutate: mutateTeam } = useSWR(session?.user?.teamId ? "/api/team/info" : null, fetcher, { revalidateOnFocus: false });

  const team = teamRes?.team || null;
  const loading = !teamRes && !!session?.user?.teamId;

  // トライアル中は支払い登録を急がせない(会費Payの口座振替登録手数料500円はHOMEBASE負担のため、
  // 続けるか分からない段階で登録されると無駄なコストになる)。billing-checkの督促開始日(トライアル
  // 終了月の前月25日)と同じ基準で、それより前は登録フォーム自体を出さない(2026-09-03追加)。
  const isEarlyForPaymentPrompt = (() => {
    if (!team) return false;
    const trialStart = team.homebaseTrialStartedAt ? new Date(team.homebaseTrialStartedAt) : new Date(team.createdAt);
    const trialEndDate = getFreeTrialEndDate(trialStart);
    const reminderStartDate = new Date(trialEndDate.getFullYear(), trialEndDate.getMonth() - 1, 25);
    return new Date() < reminderStartDate;
  })();

  const { data: groupsRes } = useSWR(session?.user?.teamId ? "/api/group" : null, fetcher);
  const groups = groupsRes?.groups || [];

  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  // 会費Pay会員登録(初回のみ)用の連絡先フォーム。team.kaihipayCustomerNumberが無い間だけ表示する。
  // このkaihipayアカウントは氏名=姓名別々、住所=都道府県/市区町村/番地以降を別々の設定。
  const [kaihipayLastName, setKaihipayLastName] = useState("");
  const [kaihipayFirstName, setKaihipayFirstName] = useState("");
  const [kaihipayLastNameKana, setKaihipayLastNameKana] = useState("");
  const [kaihipayFirstNameKana, setKaihipayFirstNameKana] = useState("");
  const [kaihipayZipCode, setKaihipayZipCode] = useState("");
  const [kaihipayPrefecture, setKaihipayPrefecture] = useState("");
  const [kaihipayMunicipalities, setKaihipayMunicipalities] = useState("");
  const [kaihipayStreetAddress, setKaihipayStreetAddress] = useState("");
  const [kaihipayTel, setKaihipayTel] = useState("");
  const [kaihipayMail, setKaihipayMail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      setBillingMessage("お支払いの設定が完了しました！");
      mutateTeam();
    } else if (params.get("billing") === "cancel") {
      setBillingMessage("お支払い設定はキャンセルされました。");
    }
  }, []);

  useEffect(() => {
    if (session?.user?.email && !kaihipayMail) {
      setKaihipayMail(session.user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  const handleStartCheckout = async () => {
    setBillingLoading(true);
    setBillingMessage("");
    try {
      // 会費Payへの反映は保存済みDB値を基準にするため、画面上の未保存のプラン選択
      // (人数ティア・スコアオプション・ストレージパック)を先に確定させてから登録する。
      // 保存せずに直接登録すると、会費Pay側には古い(保存済みの)プランしか送られない。
      await saveSettings();

      const needsContactForm = !team?.kaihipayCustomerNumber;
      if (
        needsContactForm &&
        (!kaihipayLastName || !kaihipayFirstName || !kaihipayLastNameKana || !kaihipayFirstNameKana ||
          !kaihipayZipCode || !kaihipayPrefecture || !kaihipayMunicipalities || !kaihipayStreetAddress ||
          !kaihipayTel || !kaihipayMail)
      ) {
        throw new Error("氏名(姓・名)・フリガナ(姓・名)・郵便番号・住所(都道府県・市区町村・番地)・電話番号・メールアドレスをすべて入力してください。");
      }
      const res = await fetch("/api/billing/kaihipay/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastName: kaihipayLastName,
          firstName: kaihipayFirstName,
          lastNameKana: kaihipayLastNameKana,
          firstNameKana: kaihipayFirstNameKana,
          zipCode: kaihipayZipCode,
          prefecture: kaihipayPrefecture,
          municipalities: kaihipayMunicipalities,
          streetAddress: kaihipayStreetAddress,
          tel: kaihipayTel,
          mail: kaihipayMail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "決済処理の開始に失敗しました。");

      if (data.exempt) {
        setBillingMessage("クーポン適用中のため、お支払いなしで有効化されました！");
        await mutateTeam();
      } else if (data.message) {
        setBillingMessage(data.message);
        await mutateTeam();
      }
    } catch (err: any) {
      setBillingMessage(err.message);
    } finally {
      setBillingLoading(false);
    }
  };

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("ELEMENTARY");
  const [ballType, setBallType] = useState("");
  const [homeGround, setHomeGround] = useState("");
  const [snsLinks, setSnsLinks] = useState<{ label: string; url: string }[]>([]);
  const [isProfilePublic, setIsProfilePublic] = useState(false);
  const [maxUsers, setMaxUsers] = useState(30);
  const [scorePlan, setScorePlan] = useState("NONE");
  
  // ストレージ容量モデル（2026-07-18料金ドラフト）: BASIC(プラン標準5/8/12/15GB), ADD_10/ADD_30/ADD_50
  // 追加ストレージは +10/+30/+50GB のパックを最大3つまで自由に組み合わせ（足し算・割引なし）
  const [addPacks, setAddPacks] = useState<{ gb10: number; gb30: number; gb50: number }>({ gb10: 0, gb30: 0, gb50: 0 });
  const [statsVisibility, setStatsVisibility] = useState("ALL");
  const [statsVisibleGroupIds, setStatsVisibleGroupIds] = useState<string[]>([]);

  // チーム解散（危険な操作）用state
  const [showDissolve, setShowDissolve] = useState(false);
  const [dissolveConfirmName, setDissolveConfirmName] = useState("");
  const [dissolveLoading, setDissolveLoading] = useState(false);
  const [dissolveError, setDissolveError] = useState("");

  const handleDissolveTeam = async () => {
    setDissolveError("");
    setDissolveLoading(true);
    try {
      const res = await fetch("/api/team/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: dissolveConfirmName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "チームの解散に失敗しました。");

      // セッションからチーム情報を外してダッシュボード（チーム作成/参加画面）へ
      await update({ user: { teamId: null, isOwner: false } });
      window.location.href = "/dashboard";
    } catch (err: any) {
      setDissolveError(err.message);
      setDissolveLoading(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && !(session?.user as any)?.isOwner && session?.user?.role !== "MANAGER") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  // プラン別標準容量計算ヘルパー（30人5GB / 60人8GB / 90人12GB / 120人15GB）
  const getStandardStorage = (users: number) => {
    if (users <= 30) return 5368709120; // 5GB
    if (users <= 60) return 8589934592; // 8GB
    if (users <= 90) return 12884901888; // 12GB
    return 16106127360; // 15GB
  };

  useEffect(() => {
    if (teamRes?.team) {
      setName(teamRes.team.name);
      setDescription(teamRes.team.description || "");
      setMaxUsers(teamRes.team.maxUsers);
      setScorePlan(teamRes.team.scorePlan || "NONE");
      setCategory(teamRes.team.category || "ELEMENTARY");
      setBallType(teamRes.team.ballType || "");
      setHomeGround(teamRes.team.homeGround || "");
      setIsProfilePublic(!!teamRes.team.isProfilePublic);
      try {
        const parsedLinks = JSON.parse(teamRes.team.snsLinks || "[]");
        setSnsLinks(Array.isArray(parsedLinks) ? parsedLinks : []);
      } catch {
        setSnsLinks([]);
      }

      const loadedBytes = teamRes.team.maxStorageBytes || 0;
      const stdBytes = getStandardStorage(teamRes.team.maxUsers);
      // 追加分(GB)を +50/+30/+10 の順で貪欲に分解（最大3パック）して各個数を復元
      let addedGB = Math.max(0, Math.round((loadedBytes - stdBytes) / 1073741824));
      let p50 = 0, p30 = 0, p10 = 0;
      while (addedGB >= 50 && p50 + p30 + p10 < 3) { p50++; addedGB -= 50; }
      while (addedGB >= 30 && p50 + p30 + p10 < 3) { p30++; addedGB -= 30; }
      while (addedGB >= 10 && p50 + p30 + p10 < 3) { p10++; addedGB -= 10; }
      setAddPacks({ gb10: p10, gb30: p30, gb50: p50 });

      setStatsVisibility(teamRes.team.statsVisibility || "ALL");
      setStatsVisibleGroupIds(teamRes.team.statsVisibleGroups?.map((g: any) => g.id) || []);
    }
  }, [teamRes]);

  // 現在の画面上の選択(プロフィール・プラン等)をDBに保存する。
  // handleSave(明示的な保存ボタン)とhandleStartCheckout(会費Pay登録の前提として自動保存)の両方から呼ぶ。
  const saveSettings = async () => {
    const stdBytes = getStandardStorage(maxUsers);
    const addedGB = addPacks.gb10 * 10 + addPacks.gb30 * 30 + addPacks.gb50 * 50;
    const calculatedBytes = stdBytes + addedGB * 1073741824;

    const res = await fetch("/api/team/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        category,
        ballType: ballType || null,
        homeGround,
        snsLinks: snsLinks.filter(l => l.label.trim() && l.url.trim()),
        isProfilePublic,
        maxUsers,
        scorePlan,
        maxStorageBytes: calculatedBytes,
        statsVisibility,
        statsVisibleGroupIds,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "設定の保存に失敗しました。");
    }

    await mutateTeam();

    await update({
      ...session,
      user: {
        ...session?.user,
        teamId: data.team.id,
      }
    });

    return data.team;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaveLoading(true);

    try {
      await saveSettings();
      setSuccess("チーム設定を更新しました！");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const calculateMonthlyFee = () => {
    // 2026-07-18 料金ドラフト（ROADMAP.md参照）
    let baseFee = 0;
    if (maxUsers <= 30) baseFee = 2500;
    else if (maxUsers <= 60) baseFee = 4500;
    else if (maxUsers <= 90) baseFee = 6500;
    else baseFee = 8500;

    const optionFee = scorePlan === "FULL" ? 1500 : scorePlan === "SIMPLE" ? 1000 : 0;

    const storageFee = addPacks.gb10 * 500 + addPacks.gb30 * 1000 + addPacks.gb50 * 1500;

    return baseFee + optionFee + storageFee;
  };

  if (status === "loading" || loading) {
    return (
      <main className="container animate-fade-in" style={{ padding: "40px 24px", maxWidth: "700px" }}>
        <div className="skeleton skeleton-text" style={{ width: "200px", height: "32px", marginBottom: "32px" }}></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="card card-glass skeleton-card" style={{ marginBottom: "24px" }}>
            <div className="skeleton skeleton-text short"></div>
            <div className="skeleton skeleton-text" style={{ height: "40px" }}></div>
            <div className="skeleton skeleton-text" style={{ height: "80px" }}></div>
          </div>
        ))}
      </main>
    );
  }

  return (
    <main className="container animate-fade-in" style={{ padding: "40px 24px", maxWidth: "700px" }}>
      <div style={{ marginBottom: "32px" }}>
        <Link href="/dashboard" style={{ color: "var(--primary)", fontWeight: 600, fontSize: "14px" }}>
          ← ダッシュボードへ戻る
        </Link>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginTop: "12px" }}>⚙️ チーム管理・設定</h1>
      </div>

      {success && (
        <div style={{
          background: "rgba(46, 213, 115, 0.15)",
          border: "1px solid var(--success)",
          color: "var(--success)",
          padding: "16px",
          borderRadius: "var(--radius-md)",
          marginBottom: "24px",
          fontWeight: 600
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          background: "rgba(255, 71, 87, 0.1)",
          border: "1px solid var(--danger)",
          color: "var(--danger)",
          padding: "16px",
          borderRadius: "var(--radius-md)",
          marginBottom: "24px",
          fontWeight: 600
        }}>
          {error}
        </div>
      )}

      {/* プッシュ通知のオン/オフはマイページ側にのみ設置する（ここはチームの設定ページのため） */}

      {/* システム管理(/admin)への導線はアプリ内に出さない（開発者専用・URL直打ちでアクセス。
          ページ側でisSystemAdminのサーバー側ガードあり） */}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div className="card card-glass">
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>チーム基本情報</h2>
          
          <div className="form-group">
            <label className="form-label" htmlFor="settings-name">チーム名</label>
            <input
              id="settings-name"
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saveLoading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="settings-category">チーム種別（学年の表示に使います）</label>
            <select
              id="settings-category"
              className="form-control"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saveLoading}
            >
              <option value="ELEMENTARY">小学生</option>
              <option value="JUNIOR_HIGH">中学生</option>
              <option value="HIGH_SCHOOL">高校生</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="settings-balltype">軟式・硬式</label>
            <select
              id="settings-balltype"
              className="form-control"
              value={ballType}
              onChange={(e) => setBallType(e.target.value)}
              disabled={saveLoading}
            >
              <option value="">未設定</option>
              <option value="SOFT">軟式</option>
              <option value="HARD">硬式</option>
            </select>
          </div>

          {/* 対外向けチームプロフィール（将来のチーム間連携の土台。今は公開/非公開の切り替えのみ） */}
          <div className="card" style={{ padding: "16px", marginBottom: "20px", background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>🌐 チームプロフィール（対外向け）</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "14px", lineHeight: 1.6 }}>
              他チームとつながる機能の土台です。今はまだチーム検索・つながり申請の機能はありません（準備中）。
              公開すると、このプロフィールページを知っている人が閲覧できるようになります（選手名簿は含まれません）。
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="settings-homeground">主な練習・試合会場</label>
              <input
                id="settings-homeground"
                type="text"
                className="form-control"
                value={homeGround}
                onChange={(e) => setHomeGround(e.target.value)}
                placeholder="例: 〇〇市営球場"
                disabled={saveLoading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">SNSリンク</label>
              {snsLinks.map((link, idx) => (
                <div key={idx} style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ flex: "0 0 100px" }}
                    placeholder="例: X, Instagram"
                    value={link.label}
                    onChange={(e) => setSnsLinks(prev => prev.map((l, i) => i === idx ? { ...l, label: e.target.value } : l))}
                    disabled={saveLoading}
                  />
                  <input
                    type="text"
                    className="form-control"
                    style={{ flex: 1 }}
                    placeholder="https://..."
                    value={link.url}
                    onChange={(e) => setSnsLinks(prev => prev.map((l, i) => i === idx ? { ...l, url: e.target.value } : l))}
                    disabled={saveLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setSnsLinks(prev => prev.filter((_, i) => i !== idx))}
                    disabled={saveLoading}
                    style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "18px", padding: "0 6px" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSnsLinks(prev => [...prev, { label: "", url: "" }])}
                disabled={saveLoading}
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                ＋ リンクを追加
              </button>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "14px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isProfilePublic}
                onChange={(e) => setIsProfilePublic(e.target.checked)}
                disabled={saveLoading}
              />
              このプロフィールを公開する
            </label>
            {isProfilePublic && (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                公開URL: <Link href={`/team-profile/${teamRes?.team?.id}`} style={{ color: "var(--primary)" }}>
                  {typeof window !== "undefined" ? window.location.origin : ""}/team-profile/{teamRes?.team?.id}
                </Link>
              </p>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="settings-desc">チーム紹介 / 説明</label>
            <textarea
              id="settings-desc"
              className="form-control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ resize: "vertical" }}
              disabled={saveLoading}
            />
          </div>
        </div>

        {/* App Store審査(Guideline 3.1.1、2026-09-09再指摘)対応: 「ブラウザで◯◯にアクセスして
            お手続きください」という案内文自体が「外部の購入・契約手続きへの誘導」とみなされ再指摘された。
            ボタンを消すだけでは不十分で、文言ごと完全に非表示にする(Netflix/Spotify型のreader app
            パターンに倣い、ネイティブアプリでは契約プラン関連のセクション自体を一切表示しない)。 */}
        {!isNativeApp() && (
        <>
        {team?.tier === "FREE_ENTRY" && (
          <div className="card card-glass" style={{ borderLeft: "4px solid var(--accent)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>🆓 現在は無料プランです</h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: 1.7 }}>
              入団申込み・団員リスト・団費計算の機能を無料でご利用いただけます。スケジュール共有・出欠管理・タイムライン・スコア管理などHOMEBASE本体の全機能は、下のボタンから試すことができます（登録月＋翌月は無料）。
            </p>
            <StartTrialButton onDone={() => mutateTeam()} />
          </div>
        )}

        {team?.tier !== "FREE_ENTRY" && (
        <div className="card card-glass" style={{ borderLeft: "4px solid var(--accent-blue)" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>契約プラン・オプション設定</h2>
          
          <div className="form-group">
            <span className="form-label">ベースプラン（選手＋指導者の人数上限。選手に紐づけた保護者は選手1名につき2名まで無料・カウント外）</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginTop: "8px" }}>
              {[
                { users: 30, price: "2,500" },
                { users: 60, price: "4,500" },
                { users: 90, price: "6,500" },
                { users: 120, price: "8,500" },
              ].map((plan) => (
                <button
                  key={plan.users}
                  type="button"
                  className="btn"
                  style={{
                    flexDirection: "column",
                    padding: "16px 8px",
                    background: maxUsers === plan.users ? "rgba(30, 144, 255, 0.15)" : "var(--surface)",
                    color: "var(--text-main)",
                    border: maxUsers === plan.users ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
                  }}
                  onClick={() => setMaxUsers(plan.users)}
                  disabled={saveLoading}
                >
                  <strong style={{ fontSize: "16px" }}>{plan.users === 120 ? "120人〜" : `〜${plan.users}人`}</strong>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>月額 {plan.price}円</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>121人以上の団体は要相談（お問い合わせください）</p>
          </div>
          
          <div className="form-group" style={{ marginTop: "24px" }}>
            <span className="form-label">ストレージ容量追加オプション（アルバム・ハイライト動画用／月額）</span>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 12px" }}>
              基本容量 {maxUsers <= 30 ? "5GB" : maxUsers <= 60 ? "8GB" : maxUsers <= 90 ? "12GB" : "15GB"} に、+10 / +30 / +50GB のパックを<strong>最大3つまで自由に組み合わせ</strong>て追加できます。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {([
                { key: "gb50" as const, gb: 50, fee: 1500 },
                { key: "gb30" as const, gb: 30, fee: 1000 },
                { key: "gb10" as const, gb: 10, fee: 500 },
              ]).map((pack) => {
                const count = addPacks[pack.key];
                const totalPacks = addPacks.gb10 + addPacks.gb30 + addPacks.gb50;
                return (
                  <div key={pack.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--surface)", border: count > 0 ? "2px solid var(--accent-blue)" : "1px solid var(--border)", borderRadius: "10px" }}>
                    <div>
                      <strong style={{ fontSize: "15px" }}>追加 +{pack.gb}GB</strong>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>月額 +¥{pack.fee.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button type="button" className="btn" style={{ width: "38px", height: "38px", padding: 0, fontSize: "20px", lineHeight: 1 }}
                        onClick={() => setAddPacks((p) => ({ ...p, [pack.key]: Math.max(0, p[pack.key] - 1) }))}
                        disabled={saveLoading || count === 0}>−</button>
                      <strong style={{ minWidth: "24px", textAlign: "center", fontSize: "17px" }}>{count}</strong>
                      <button type="button" className="btn" style={{ width: "38px", height: "38px", padding: 0, fontSize: "20px", lineHeight: 1 }}
                        onClick={() => setAddPacks((p) => (totalPacks < 3 ? { ...p, [pack.key]: p[pack.key] + 1 } : p))}
                        disabled={saveLoading || totalPacks >= 3}>＋</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {(() => {
              const addedGB = addPacks.gb10 * 10 + addPacks.gb30 * 30 + addPacks.gb50 * 50;
              const addedFee = addPacks.gb10 * 500 + addPacks.gb30 * 1000 + addPacks.gb50 * 1500;
              const baseGB = maxUsers <= 30 ? 5 : maxUsers <= 60 ? 8 : maxUsers <= 90 ? 12 : 15;
              const totalPacks = addPacks.gb10 + addPacks.gb30 + addPacks.gb50;
              return (
                <div style={{ marginTop: "12px", padding: "12px 16px", background: "rgba(30,144,255,0.08)", borderRadius: "10px", fontSize: "14px" }}>
                  追加合計 <strong>+{addedGB}GB</strong>（月額 <strong>+¥{addedFee.toLocaleString()}</strong>）／ 合計容量 <strong>{baseGB + addedGB}GB</strong>
                  {totalPacks >= 3 && <span style={{ color: "var(--text-muted)", marginLeft: "8px" }}>（最大3パックまで）</span>}
                </div>
              );
            })()}
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>※ストレージ追加は月額のみ（年払い対象外）。</p>
          </div>

          <div className="form-group" style={{ marginTop: "24px" }}>
            <span className="form-label">スコア・成績管理オプション</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn"
                style={{
                  flexDirection: "column",
                  padding: "16px 8px",
                  background: scorePlan === "NONE" ? "rgba(30, 144, 255, 0.15)" : "var(--surface)",
                  color: "var(--text-main)",
                  border: scorePlan === "NONE" ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
                }}
                onClick={() => setScorePlan("NONE")}
                disabled={saveLoading}
              >
                <strong style={{ fontSize: "16px" }}>標準（まとめ入力）</strong>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>＋ 0円</span>
              </button>

              <button
                type="button"
                className="btn"
                style={{
                  flexDirection: "column",
                  padding: "16px 8px",
                  background: scorePlan === "SIMPLE" ? "rgba(30, 144, 255, 0.15)" : "var(--surface)",
                  color: "var(--text-main)",
                  border: scorePlan === "SIMPLE" ? "2px solid var(--accent-blue)" : "1px solid var(--border)",
                }}
                onClick={() => setScorePlan("SIMPLE")}
                disabled={saveLoading}
              >
                <strong style={{ fontSize: "16px" }}>かんたんスコア速報</strong>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>＋ 1,000円（観戦モード付き）</span>
              </button>

            </div>
            {/* 本格スコアブック連携(FULL)は開発中のため、完成するまで選択肢として表示しない */}
          </div>

          {scorePlan !== "NONE" && (
            <div style={{
              marginTop: "16px",
              padding: "16px",
              background: "rgba(0, 0, 0, 0.02)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
            }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>👀 成績・ランキングの公開範囲</h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
                チーム全体成績の閲覧権限を設定します。※マイページの自分の成績は常に見ることができます。
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="statsVisibility"
                    value="ALL"
                    checked={statsVisibility === "ALL"}
                    onChange={(e) => setStatsVisibility(e.target.value)}
                  />
                  <span style={{ fontSize: "14px" }}>🟢 全体に公開（すべての選手・保護者が閲覧可能）</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="statsVisibility"
                    value="MANAGER_ONLY"
                    checked={statsVisibility === "MANAGER_ONLY"}
                    onChange={(e) => setStatsVisibility(e.target.value)}
                  />
                  <span style={{ fontSize: "14px" }}>🔴 指導者・管理者のみ（選手・保護者には非公開）</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="statsVisibility"
                    value="SPECIFIC_GROUPS"
                    checked={statsVisibility === "SPECIFIC_GROUPS"}
                    onChange={(e) => setStatsVisibility(e.target.value)}
                  />
                  <span style={{ fontSize: "14px" }}>👥 特定のグループにのみ公開</span>
                </label>
              </div>

              {statsVisibility === "SPECIFIC_GROUPS" && (
                <div style={{ marginTop: "16px", padding: "12px", background: "var(--surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>公開するグループを選択</p>
                  {groups.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>グループが作成されていません。</p>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {groups.map((g: any) => (
                        <label key={g.id} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", background: "rgba(0, 0, 0, 0.05)", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={statsVisibleGroupIds.includes(g.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setStatsVisibleGroupIds([...statsVisibleGroupIds, g.id]);
                              } else {
                                setStatsVisibleGroupIds(statsVisibleGroupIds.filter(id => id !== g.id));
                              }
                            }}
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{
            marginTop: "24px",
            padding: "16px",
            background: "rgba(46, 213, 115, 0.1)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px"
          }}>
            <span style={{ fontWeight: 600, fontSize: "14px" }}>想定月額の合計</span>
            <strong style={{ fontSize: "22px", color: "var(--accent)", whiteSpace: "nowrap" }}>
              ¥{calculateMonthlyFee().toLocaleString()}<span style={{ fontSize: "13px", color: "var(--text-main)" }}> / 月</span>
            </strong>
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {(team?.homebaseTrialStartedAt || team?.createdAt) && isWithinSignupFreeTrial(new Date(team.homebaseTrialStartedAt || team.createdAt)) && (
              <div style={{ fontSize: "13px", color: "var(--accent)", fontWeight: 600, background: "rgba(0,0,0,0.03)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                現在無料でご利用いただけます（
                {getFreeTrialEndDate(new Date(team.homebaseTrialStartedAt || team.createdAt)).toLocaleDateString("ja-JP")} 以降、登録済みのプランで請求を開始します）
              </div>
            )}
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              現在のお支払い状況:{" "}
              <strong style={{ color: team?.billingStatus === "ACTIVE" ? "var(--accent)" : "var(--text-main)" }}>
                {team?.billingStatus === "ACTIVE"
                  ? "有効"
                  : team?.billingStatus === "PAST_DUE"
                  ? "支払い遅延"
                  : team?.billingStatus === "CANCELED"
                  ? "解約済み"
                  // billingStatusは実際の入金Webhookを受けて初めてACTIVEになるため、
                  // 登録済みでもここが「未設定」のままの期間がある。会員登録自体が未着手の状態と
                  // 混同されないよう、登録済み(kaihipayCustomerNumberあり)かどうかで文言を分ける。
                  : team?.kaihipayCustomerNumber
                  ? "登録手続き済み（初回請求待ち）"
                  : "未設定"}
              </strong>
              {team?.couponId && <span style={{ marginLeft: "8px" }}>(クーポン適用中)</span>}
            </div>

            <EndTrialButton team={team} onDone={() => mutateTeam()} />

            {!team?.kaihipayCustomerNumber && !isEarlyForPaymentPrompt && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", background: "rgba(0,0,0,0.03)", borderRadius: "var(--radius-md)" }}>
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  初回のみ、お支払い担当者の情報を登録してください(会費Pay経由の口座振替/カード決済に使用します)。
                </p>
                <p style={{ fontSize: "12px", color: "var(--danger)", fontWeight: 600 }}>
                  ⚠️ ご登録後に無料プラン(入団申込み・団費管理のみ)へ戻す場合、直近1ヶ月分のお支払いは日割り返金なしで発生します(翌月以降は請求されません)。
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
                  <input className="form-control" placeholder="姓(漢字・9文字以内)" value={kaihipayLastName} onChange={(e) => setKaihipayLastName(e.target.value)} />
                  <input className="form-control" placeholder="名(漢字・9文字以内)" value={kaihipayFirstName} onChange={(e) => setKaihipayFirstName(e.target.value)} />
                  <input className="form-control" placeholder="セイ(カナ・9文字以内)" value={kaihipayLastNameKana} onChange={(e) => setKaihipayLastNameKana(e.target.value)} />
                  <input className="form-control" placeholder="メイ(カナ・9文字以内)" value={kaihipayFirstNameKana} onChange={(e) => setKaihipayFirstNameKana(e.target.value)} />
                  <input className="form-control" placeholder="郵便番号(ハイフンなし7桁)" value={kaihipayZipCode} onChange={(e) => setKaihipayZipCode(e.target.value)} />
                  <input className="form-control" placeholder="都道府県" value={kaihipayPrefecture} onChange={(e) => setKaihipayPrefecture(e.target.value)} />
                  <input className="form-control" placeholder="市区町村" value={kaihipayMunicipalities} onChange={(e) => setKaihipayMunicipalities(e.target.value)} />
                  <input className="form-control" placeholder="番地・建物名" value={kaihipayStreetAddress} onChange={(e) => setKaihipayStreetAddress(e.target.value)} />
                  <input className="form-control" placeholder="電話番号(ハイフンなし)" value={kaihipayTel} onChange={(e) => setKaihipayTel(e.target.value)} />
                  <input className="form-control" placeholder="メールアドレス" value={kaihipayMail} onChange={(e) => setKaihipayMail(e.target.value)} />
                </div>
              </div>
            )}

            {!team?.kaihipayCustomerNumber && isEarlyForPaymentPrompt ? (
              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                お支払い方法のご登録は、無料期間の終了が近づいたタイミング(通知でお知らせします)で受け付けます。今は特に何もしていただく必要はありません。
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStartCheckout}
                  disabled={billingLoading}
                  className="btn btn-primary"
                  style={{ alignSelf: "flex-start", padding: "10px 24px" }}
                >
                  {billingLoading ? "処理中..." : team?.billingStatus === "ACTIVE" ? "お支払い内容を変更する" : "お支払いを設定する"}
                </button>
                {billingMessage && (
                  <div style={{ fontSize: "13px", color: "var(--text-main)" }}>{billingMessage}</div>
                )}
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  ※初回登録後、ご登録のメールアドレス宛てに会費Payから決済方法(クレジットカード/口座振替)登録のご案内メールが届きます。メール内のリンクから設定してください。
                </p>
              </>
            )}
          </div>
        </div>
        )}
        </>
        )}

        <div className="card card-glass">
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>招待用情報</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            新メンバー（選手・マネージャー）をチームに招待する際は、ログイン画面のURLを共有してください。
          </p>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            flexWrap: "wrap",
            gap: "16px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "#fff", padding: "16px", borderRadius: "8px", width: "100%", flexWrap: "wrap" }}>
              <QRCodeCanvas 
                value={`${typeof window !== 'undefined' ? window.location.origin : 'https://baseball-saas.vercel.app'}/login`} 
                size={120} 
                level={"M"}
                includeMargin={false}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <p style={{ color: "#333", fontSize: "13px", fontWeight: 700, marginBottom: "4px" }}>ログイン画面QRコード</p>
                  <p style={{ color: "#666", fontSize: "11px", maxWidth: "240px" }}>
                    メンバー追加画面で設定した「ログインID」と「初期パスワード」と一緒に、こちらのログイン画面を共有してください。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/login`;
                    navigator.clipboard.writeText(url);
                    const btn = document.getElementById("copy-link-btn");
                    if (btn) {
                      btn.innerText = "✓ コピーしました！";
                      btn.style.background = "var(--success)";
                      btn.style.color = "#fff";
                      setTimeout(() => {
                        btn.innerText = "🔗 ログインリンクをコピー";
                        btn.style.background = "rgba(30, 144, 255, 0.1)";
                        btn.style.color = "var(--primary)";
                      }, 3000);
                    }
                  }}
                  id="copy-link-btn"
                  style={{
                    background: "rgba(30, 144, 255, 0.1)",
                    color: "var(--primary)",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    width: "fit-content"
                  }}
                >
                  🔗 ログインリンクをコピー
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px" }}>
          <Link href="/dashboard" className="btn btn-secondary" style={{ width: "120px" }}>
            戻る
          </Link>
          <button type="submit" className="btn btn-primary" style={{ width: "180px" }} disabled={saveLoading}>
            {saveLoading ? "保存中..." : "設定を保存する"}
          </button>
        </div>
      </form>

      {/* 入団申込みフォームの設定は「書類の保管庫」(/attach/documents)の申込書に統合済み(2026-09-08)。 */}

      {/* アプリの最新化・キャッシュ削除 */}
      <div className="card" style={{ marginTop: "32px", border: "1px solid #93c5fd", background: "#f0f9ff" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0369a1", marginBottom: "6px" }}>
          🔄 アプリの最新化（キャッシュ更新）
        </h2>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.6 }}>
          画面の表示崩れや、新機能・修正がアプリに即座に反映されない場合、ここから一時キャッシュを消去して最新状態に更新できます。
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            try {
              if (typeof window !== "undefined" && "caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch {}
            sessionStorage.clear();
            window.location.href = window.location.pathname + "?v=" + Date.now();
          }}
          style={{ background: "#ffffff", borderColor: "#38bdf8", color: "#0284c7", fontWeight: 700, padding: "8px 16px", fontSize: "13px" }}
        >
          ✨ キャッシュをクリアして最新状態にする
        </button>
      </div>

      {/* 危険な操作: チーム解散（オーナーのみ） */}
      {(session?.user as any)?.isOwner && (
        <div className="card" style={{ marginTop: "40px", border: "1px solid var(--danger)", background: "rgba(255, 71, 87, 0.03)" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 800, color: "var(--danger)", marginBottom: "8px" }}>⚠️ 危険な操作</h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px", lineHeight: 1.7 }}>
            チームを解散すると、予定・タイムライン投稿・アルバム・メッセージ・スコアなど<strong style={{ color: "var(--danger)" }}>チームの全データが完全に削除されます（元に戻せません）</strong>。
            メンバーのアカウント自体は削除されず、「チーム未所属」の状態に戻ります。
          </p>
          {!showDissolve ? (
            <button
              type="button"
              className="btn"
              onClick={() => setShowDissolve(true)}
              style={{ background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", padding: "8px 20px", fontSize: "13px" }}
            >
              チームを解散する...
            </button>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>
                確認のため、チーム名「<span style={{ color: "var(--danger)" }}>{name}</span>」を正確に入力してください:
              </p>
              <input
                type="text"
                className="form-control"
                placeholder="チーム名を入力"
                value={dissolveConfirmName}
                onChange={(e) => setDissolveConfirmName(e.target.value)}
                disabled={dissolveLoading}
                style={{ marginBottom: "12px" }}
              />
              {dissolveError && (
                <p style={{ fontSize: "12px", color: "var(--danger)", fontWeight: 700, marginBottom: "12px" }}>{dissolveError}</p>
              )}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowDissolve(false); setDissolveConfirmName(""); setDissolveError(""); }}
                  disabled={dissolveLoading}
                  style={{ padding: "8px 16px", fontSize: "13px" }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleDissolveTeam}
                  disabled={dissolveLoading || dissolveConfirmName.trim() !== name}
                  style={{
                    background: dissolveConfirmName.trim() === name ? "var(--danger)" : "rgba(255,71,87,0.3)",
                    color: "#fff", border: "none", padding: "8px 20px", fontSize: "13px", fontWeight: 700,
                    cursor: dissolveConfirmName.trim() === name ? "pointer" : "not-allowed",
                  }}
                >
                  {dissolveLoading ? "解散処理中..." : "完全に解散する"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

