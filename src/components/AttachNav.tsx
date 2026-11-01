"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 「HOMEBASE Attach」専用ナビ(2026-09-03新設)。/dashboard側のBottomNavとは完全に別コンポーネント。
// HOMEBASE本体との行き来は、AreaSwitchBar(全ページ上部の常設バー、鍵アイコンでFREE_ENTRYにも
// 分かりやすく)に一本化した(2026-09-03)。ここに重複したリンクを置くとナビが煩雑になるため置かない。
// 2026-09-04: オーナー案(CLAUDE_HANDOFF.md Update #54)に合わせ「選手一覧/入団申込/会費管理/設定管理」の
// 4項目に再編。旧来の「管理」単体リンクは、書類の保管庫と管理ページをまとめた「設定管理」ハブ
// (/attach/settings)に統合した。2026-09-08: 「入団申込」の中身を、旧EnrollmentApplication方式
// から書類の保管庫の申込書(AttachDocument)への回答一覧(/attach/applications)に置き換えた。
const NAV_ITEMS = [
  { href: "/attach/team-roster", icon: "🧑‍🤝‍🧑", label: "選手一覧" },
  { href: "/attach/applications", icon: "📋", label: "入団申込" },
  { href: "/attach/dues-settings", icon: "📊", label: "会費管理" },
];
const SETTINGS_HUB_PREFIXES = ["/attach/settings", "/attach/admin"];

export default function AttachNav() {
  const pathname = usePathname();
  const isSettingsHubActive = SETTINGS_HUB_PREFIXES.some((p) => pathname?.startsWith(p));

  return (
    <>
      {/* スマホ用ボトムナビゲーション */}
      <nav className="attach-bottom-nav">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={`attach-nav-item ${pathname?.startsWith(item.href) ? "active" : ""}`}>
            <span className="icon">{item.icon}</span>
            <span className="label">{item.label}</span>
          </Link>
        ))}
        <Link href="/attach/settings" className={`attach-nav-item ${isSettingsHubActive ? "active" : ""}`}>
          <span className="icon">⚙️</span>
          <span className="label">設定管理</span>
        </Link>
      </nav>

      {/* デスクトップ用サイドバー */}
      <nav className="attach-sidebar">
        <div style={{ padding: "24px 20px" }}>
          <div className="attach-brand">
            <div className="attach-brand-logo">HOMEBASE <span>Attach</span></div>
            <div className="attach-brand-sub">入団・団費管理</div>
          </div>

          <div className="attach-sidebar-group">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={`attach-sidebar-item ${pathname?.startsWith(item.href) ? "active" : ""}`}>
                {item.icon} {item.label}
              </Link>
            ))}
            <Link href="/attach/settings" className={`attach-sidebar-item ${isSettingsHubActive ? "active" : ""}`}>
              ⚙️ 設定管理
            </Link>
          </div>
        </div>
      </nav>

      <style dangerouslySetInnerHTML={{__html: `
        .attach-bottom-nav { display: none; }
        .attach-sidebar { display: none; }

        @media (max-width: 768px) {
          .attach-bottom-nav {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(15px);
            border-top: 1px solid var(--border);
            z-index: 1000;
            padding: 8px 12px;
            padding-bottom: calc(8px + env(safe-area-inset-bottom, 12px));
            justify-content: space-around;
          }

          .attach-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            color: var(--text-muted);
            text-decoration: none;
            gap: 4px;
            transition: var(--transition);
          }

          .attach-nav-item.active { color: var(--primary); }
          .attach-nav-item .icon { font-size: 20px; }
          .attach-nav-item .label { font-size: 10px; font-weight: 600; }
        }

        @media (min-width: 769px) {
          .attach-sidebar {
            display: block;
            width: 240px;
            height: 100vh;
            position: fixed;
            top: 0;
            left: 0;
            background: var(--surface);
            border-right: 1px solid var(--border);
            z-index: 50;
            overflow-y: auto;
          }

          .attach-brand {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
          }

          .attach-brand-logo {
            font-size: 16px;
            font-weight: 900;
            letter-spacing: 0.3px;
          }
          .attach-brand-logo span {
            color: var(--primary);
          }

          .attach-brand-sub {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 2px;
          }

          .attach-sidebar-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .attach-sidebar-item {
            display: flex;
            align-items: center;
            padding: 10px 14px;
            border-radius: var(--radius-sm);
            font-size: 14px;
            font-weight: 600;
            color: var(--text-muted);
            transition: var(--transition);
            text-decoration: none;
            border: 1px solid transparent;
          }

          .attach-sidebar-item:hover {
            background: rgba(255, 255, 255, 0.02);
            color: var(--text-main);
          }

          .attach-sidebar-item.active {
            background: rgba(255, 71, 87, 0.08);
            border: 1px solid rgba(255, 71, 87, 0.15);
            color: var(--primary);
          }
        }
      `}} />
    </>
  );
}
