import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import SyncStorageButton from "./SyncStorageButton";
import CouponManager from "./CouponManager";
import DeleteTeamButton from "./DeleteTeamButton";

export const dynamic = 'force-dynamic';

// ストレージ基本容量（maxUsersの段階に連動。設定画面 getStandardStorage と同じ基準）
function getStandardStorageBytes(maxUsers: number): number {
  if (maxUsers <= 30) return 5368709120; // 5GB
  if (maxUsers <= 60) return 8589934592; // 8GB
  if (maxUsers <= 90) return 12884901888; // 12GB
  return 16106127360; // 15GB
}

// 基本容量を超えた分を +50/+30/+10GBパック(最大3個・追加ごとの単価500/1000/1500円)に貪欲分解し、
// その月額を算出する（設定画面のパック数復元ロジックと同じ考え方）。
function estimateStorageAddonFee(maxStorageBytes: number, maxUsers: number): number {
  const stdBytes = getStandardStorageBytes(maxUsers);
  let addedGB = Math.max(0, Math.round((maxStorageBytes - stdBytes) / 1073741824));
  let p50 = 0, p30 = 0, p10 = 0;
  while (addedGB >= 50 && p50 + p30 + p10 < 3) { p50++; addedGB -= 50; }
  while (addedGB >= 30 && p50 + p30 + p10 < 3) { p30++; addedGB -= 30; }
  while (addedGB >= 10 && p50 + p30 + p10 < 3) { p10++; addedGB -= 10; }
  return p10 * 500 + p30 * 1000 + p50 * 1500;
}

// ベースプラン(人数枠)の定価のみ。クーポン割引はここにしか適用されない(会費Pay側の実装と同じ、2026-08-27)。
function estimateBaseFee(maxUsers: number): number | null {
  if (maxUsers <= 30) return 2500;
  if (maxUsers <= 60) return 4500;
  if (maxUsers <= 90) return 6500;
  if (maxUsers <= 120) return 8500;
  return null; // 120超は要相談
}

// プラン設定から推定月額(定価)を算出（実課金/Stripeは未連携のため"推定"。トライアル中は実請求なし）
// 料金はROADMAP 2026-07-18版に準拠。
function estimateMonthlyFee(team: { maxUsers: number; scorePlan: string | null; maxStorageBytes?: number }): number | null {
  const base = estimateBaseFee(team.maxUsers);
  if (base === null) return null;
  const scoreOption = team.scorePlan && team.scorePlan !== "NONE" ? 1000 : 0;
  const storageFee = team.maxStorageBytes ? estimateStorageAddonFee(team.maxStorageBytes, team.maxUsers) : 0;
  return base + scoreOption + storageFee;
}

type TeamCoupon = { active: boolean; discountPercent: number; durationMonths: number | null; fullyExempt: boolean } | null;

// 適用中クーポンの割引が現時点で有効か（期間内か）
function couponActive(coupon: TeamCoupon, appliedAt: Date | null): boolean {
  if (!coupon || !coupon.active) return false;
  if (coupon.durationMonths == null) return true; // 永続
  if (!appliedAt) return true;
  const end = new Date(appliedAt);
  end.setMonth(end.getMonth() + coupon.durationMonths);
  return new Date() < end;
}

// クーポン割引後の実効月額。割引はベースプラン(人数枠)のみに適用される(会費Pay側の実装と同じ、2026-08-27)。
// fullyExempt(審査用アカウント等)の場合は会費Pay登録自体をしないため、スコア/ストレージ込みで全額0円。
function netMonthlyFee(team: { maxUsers: number; scorePlan: string | null; maxStorageBytes?: number }, coupon: TeamCoupon, appliedAt: Date | null): number | null {
  const gross = estimateMonthlyFee(team);
  if (gross === null) return null;
  if (!couponActive(coupon, appliedAt)) return gross;
  if (coupon!.fullyExempt && coupon!.discountPercent === 100) return 0;
  const base = estimateBaseFee(team.maxUsers) ?? 0;
  const discountedBase = Math.round(base * (1 - coupon!.discountPercent / 100));
  return gross - base + discountedBase;
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) redirect("/login");

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.isSystemAdmin) redirect("/dashboard");

  // 全体統計の取得
  const totalUsers = await db.user.count();
  const totalTeams = await db.team.count();
  const totalEvents = await db.event.count();

  // チームごとの詳細データ取得
  const teams = await db.team.findMany({
    include: {
      _count: {
        select: { members: true, events: true }
      },
      coupon: true,
      members: {
        where: { graduated: false },
        select: { role: true, children: { select: { id: true } } },
      },
    },
    orderBy: { createdAt: "desc" }
  });

  // 課金対象人数を算出（選手・指導者は全員課金対象、保護者は選手1人につき2人まで無料枠）。
  // user/create・bulk-createの登録時チェックと同じロジック(選手にリンクした保護者の先着2人が無料)。
  function getBillableMemberInfo(members: { role: string; children: { id: string }[] }[]) {
    const playerToParents = new Map<string, Set<number>>();
    members.forEach((m, idx) => {
      if (m.role === "PARENT") {
        m.children.forEach((c) => {
          if (!playerToParents.has(c.id)) playerToParents.set(c.id, new Set());
          playerToParents.get(c.id)!.add(idx);
        });
      }
    });
    const freeParentIdx = new Set<number>();
    playerToParents.forEach((idxSet) => Array.from(idxSet).slice(0, 2).forEach((i) => freeParentIdx.add(i)));

    let billableCount = 0;
    let parentCount = 0;
    let freeParentCount = 0;
    members.forEach((m, idx) => {
      if (m.role === "PLAYER" || m.role === "MANAGER") {
        billableCount++;
      } else if (m.role === "PARENT") {
        parentCount++;
        if (freeParentIdx.has(idx)) {
          freeParentCount++;
        } else {
          billableCount++;
        }
      }
    });
    return { billableCount, parentCount, freeParentCount };
  }

  // クーポン一覧（適用中チーム付き）
  const coupons = await db.coupon.findMany({
    include: { teams: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  // 全チームのストレージ使用量の合計を Cloudflare R2 のメインストレージとして計算
  const allTeams = await db.team.findMany({ select: { storageUsedBytes: true } });
  const totalR2Bytes = allTeams.reduce((sum, t) => sum + (t.storageUsedBytes || 0), 0);
  const totalR2MB = (totalR2Bytes / (1024 * 1024)).toFixed(2);
  const r2LimitMB = process.env.R2_SERVER_LIMIT_MB ? parseFloat(process.env.R2_SERVER_LIMIT_MB) : 10000.00; // 無料枠10GB

  // 推定月額売上(MRR)と各種合計（クーポン割引後）
  const teamNetFees = teams.map(t => netMonthlyFee(t, t.coupon as TeamCoupon, t.couponAppliedAt));
  const totalMRR = teamNetFees.reduce((sum: number, fee) => sum + (fee ?? 0), 0);
  const grossMRR = teams.reduce((sum: number, t) => sum + (estimateMonthlyFee(t) ?? 0), 0);
  const totalDiscount = grossMRR - totalMRR;
  const customQuoteCount = teams.map(t => estimateMonthlyFee(t)).filter(fee => fee === null).length;
  const totalMembersInTeams = teams.reduce((sum, t) => sum + t._count.members, 0);

  return (
    <div className="container" style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>📊 システム管理ダッシュボード</h1>
        <SyncStorageButton />
      </div>
      
      <div className="grid-responsive" style={{ marginBottom: "40px" }}>
        <div className="card card-glass" style={{ textAlign: "center", padding: "24px", border: "1px solid #e1b12c55" }}>
          <h2 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px" }}>推定月額売上 (MRR)</h2>
          <p style={{ fontSize: "32px", fontWeight: 800, color: "#e1b12c", margin: 0 }}>¥{totalMRR.toLocaleString()}</p>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.4 }}>
            プラン推定・トライアル中は実請求なし
            {totalDiscount > 0 ? ` / クーポン割引 -¥${totalDiscount.toLocaleString()}` : ""}
            {customQuoteCount > 0 ? ` / 要相談 ${customQuoteCount}件` : ""}
          </p>
        </div>
        <div className="card card-glass" style={{ textAlign: "center", padding: "24px" }}>
          <h2 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px" }}>総ユーザー数</h2>
          <p style={{ fontSize: "32px", fontWeight: 800, color: "var(--primary)", margin: 0 }}>{totalUsers}</p>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>うちチーム所属 {totalMembersInTeams}名</p>
        </div>
        <div className="card card-glass" style={{ textAlign: "center", padding: "24px" }}>
          <h2 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px" }}>登録チーム数</h2>
          <p style={{ fontSize: "32px", fontWeight: 800, color: "var(--accent)", margin: 0 }}>{totalTeams}</p>
        </div>
        <div className="card card-glass" style={{ textAlign: "center", padding: "24px" }}>
          <h2 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px" }}>累計イベント数</h2>
          <p style={{ fontSize: "32px", fontWeight: 800, color: "var(--success)", margin: 0 }}>{totalEvents}</p>
        </div>
        
        <div className="card card-glass" style={{ textAlign: "center", padding: "24px", position: "relative" }}>
          <h2 style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px" }}>R2 容量 (アルバム等メイン)</h2>
          <p style={{ fontSize: "20px", fontWeight: 800, color: "#9c88ff", margin: 0, marginTop: "8px" }}>
            {totalR2MB} <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-muted)" }}>/ {r2LimitMB.toFixed(0)} MB</span>
          </p>
        </div>
      </div>

      <CouponManager coupons={coupons.map(c => ({
        ...c,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
      })) as any} />

      <div className="card card-glass">
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
          🏢 登録チーム一覧（契約・請求管理）
        </h2>
        
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "1050px" }}>
            <thead>
              <tr style={{ background: "var(--surface-hover)", borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: "12px", fontWeight: 700 }}>チーム名</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>作成日</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>ユーザー数</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>上限</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>スコア機能プラン</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>月額(推定)</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>ストレージ使用量</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>状態</th>
                <th style={{ padding: "12px", fontWeight: 700 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(team => {
                const { billableCount, parentCount, freeParentCount } = getBillableMemberInfo(team.members);
                const isOverLimit = billableCount > team.maxUsers;

                let planBadge = "badge-secondary";
                let planText = "機能なし";
                if (team.scorePlan === "SIMPLE") { planBadge = "badge-primary"; planText = "簡易版"; }
                if (team.scorePlan === "FULL") { planBadge = "badge-accent"; planText = "本格版"; }

                return (
                  <tr key={team.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px", fontWeight: 700 }}>{team.name}</td>
                    <td style={{ padding: "12px", color: "var(--text-muted)", fontSize: "14px" }}>
                      {new Date(team.createdAt).toLocaleDateString('ja-JP')}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ color: isOverLimit ? "var(--danger)" : "var(--text-main)", fontWeight: isOverLimit ? 800 : 500 }}>
                        {billableCount}
                      </span>
                      {parentCount > 0 && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          保護者（無料枠）{freeParentCount}人
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", color: "var(--text-muted)" }}>{team.maxUsers}</td>
                    <td style={{ padding: "12px" }}>
                      <span className={`badge ${planBadge}`}>{planText}</span>
                    </td>
                    <td style={{ padding: "12px", fontWeight: 700 }}>
                      {(() => {
                        const gross = estimateMonthlyFee(team);
                        if (gross === null) return <span style={{ color: "var(--text-muted)" }}>要相談</span>;
                        const net = netMonthlyFee(team, team.coupon as TeamCoupon, team.couponAppliedAt);
                        if (net !== gross) {
                          return (
                            <span>
                              <span style={{ textDecoration: "line-through", color: "var(--text-muted)", fontWeight: 500, fontSize: "12px" }}>¥{gross.toLocaleString()}</span>{" "}
                              <span style={{ color: "#e1b12c" }}>¥{net!.toLocaleString()}</span>
                              {team.coupon && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>🎟️ {team.coupon.code}</div>}
                            </span>
                          );
                        }
                        return `¥${gross.toLocaleString()}`;
                      })()}
                    </td>
                    <td style={{ padding: "12px", minWidth: "140px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {(team.storageUsedBytes / (1024 * 1024)).toFixed(1)}MB / {(team.maxStorageBytes / (1024 * 1024)).toFixed(1)}MB
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--surface)", borderRadius: "4px", overflow: "hidden", marginTop: "4px" }}>
                        <div style={{ 
                          width: `${Math.min((team.storageUsedBytes / team.maxStorageBytes) * 100, 100)}%`, 
                          height: "100%", 
                          background: team.storageUsedBytes > (team.maxStorageBytes * 0.9) ? "var(--danger)" : "var(--primary)" 
                        }}></div>
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      {isOverLimit ? (
                        <span className="badge badge-danger">上限超過</span>
                      ) : (
                        <span className="badge badge-success">正常</span>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <DeleteTeamButton teamId={team.id} teamName={team.name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
