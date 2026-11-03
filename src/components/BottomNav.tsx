"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isManager =
    session?.user?.isOwner ||
    session?.user?.canManageUsers ||
    session?.user?.role === "MANAGER";

  const { data: notifData } = useSWR(
    session?.user && pathname !== "/dashboard" ? "/api/user/notifications" : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  const { data: convData } = useSWR(
    session?.user ? "/api/messages" : null,
    fetcher,
    { revalidateOnFocus: true }
  );
  const unreadMessagesCount = convData
    ? convData.filter((c: { hasUnread?: boolean }) => c.hasUnread).length
    : 0;

  const { data: columnData } = useSWR(
    session?.user?.teamId ? "/api/columns" : null,
    fetcher,
    { revalidateOnFocus: true }
  );
  const unreadColumnsCount = columnData?.unreadCount || 0;

  const { data: noteData } = useSWR(
    session?.user?.teamId ? "/api/notes" : null,
    fetcher,
    { revalidateOnFocus: true }
  );
  const unrepliedNotesCount = noteData?.unrepliedCount || 0;

  useEffect(() => {
    if (pathname === "/dashboard") {
      setUnreadCount(0);
    } else if (notifData) {
      setUnreadCount(notifData.unreadCount || 0);
    }
  }, [pathname, notifData]);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="bottom-nav">
        <Link
          href="/dashboard"
          className={`nav-item ${pathname === "/dashboard" ? "active" : ""}`}
          style={{ position: "relative" }}
        >
          <span className="icon">
            💬
            {unreadCount > 0 && <span className="badge-dot">N</span>}
          </span>
          <span className="label">タイムライン</span>
        </Link>

        <Link
          href="/dashboard/columns"
          className={`nav-item ${pathname?.startsWith("/dashboard/columns") ? "active" : ""}`}
          style={{ position: "relative" }}
        >
          <span className="icon">
            📚
            {unreadColumnsCount > 0 && (
              <span className="badge-count">{unreadColumnsCount}</span>
            )}
          </span>
          <span className="label">コラム</span>
        </Link>

        <Link
          href="/dashboard/notes"
          className={`nav-item ${pathname?.startsWith("/dashboard/notes") ? "active" : ""}`}
          style={{ position: "relative" }}
        >
          <span className="icon">
            📓
            {unrepliedNotesCount > 0 && (
              <span className="badge-count">{unrepliedNotesCount}</span>
            )}
          </span>
          <span className="label">野球ノート</span>
        </Link>

        <Link
          href="/dashboard/messages"
          className={`nav-item ${pathname?.startsWith("/dashboard/messages") ? "active" : ""}`}
          style={{ position: "relative" }}
        >
          <span className="icon">
            ✉️
            {unreadMessagesCount > 0 && (
              <span className="badge-count">{unreadMessagesCount}</span>
            )}
          </span>
          <span className="label">メッセージ</span>
        </Link>

        <button
          type="button"
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className={`nav-item btn-clean ${isDrawerOpen ? "active" : ""}`}
        >
          <span className="icon">☰</span>
          <span className="label">メニュー</span>
        </button>
      </nav>

      {isDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div
            className="drawer-card animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div className="drawer-handle" />
              <h3 style={{ fontSize: "16px", fontWeight: 800 }}>
                ⚡ SKILLBASE メニュー
              </h3>
            </div>
            <div className="drawer-grid">
              <Link href="/dashboard/columns" className="drawer-item">
                <span className="drawer-icon">📚</span>
                <span className="drawer-label">コラム・教材</span>
              </Link>
              <Link href="/dashboard/notes" className="drawer-item">
                <span className="drawer-icon">📓</span>
                <span className="drawer-label">野球ノート</span>
              </Link>
              <Link href="/dashboard/roster" className="drawer-item">
                <span className="drawer-icon">👥</span>
                <span className="drawer-label">チーム名簿</span>
              </Link>
              <Link href="/dashboard/profile" className="drawer-item">
                <span className="drawer-icon">👤</span>
                <span className="drawer-label">マイページ</span>
              </Link>
              {isManager && (
                <Link href="/dashboard/settings" className="drawer-item">
                  <span className="drawer-icon">⚙️</span>
                  <span className="drawer-label">チーム設定</span>
                </Link>
              )}
            </div>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setIsDrawerOpen(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      <nav className="desktop-sidebar">
        <div style={{ padding: "24px 20px" }}>
          <div style={{ marginBottom: "24px", padding: "0 8px" }}>
            <Link
              href="/dashboard"
              style={{
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 900,
                fontSize: "20px",
                color: "var(--text-main)",
                letterSpacing: "0.5px",
              }}
            >
              <span style={{ color: "var(--primary)" }}>⚡</span> SKILLBASE
            </Link>
            <p
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginTop: "2px",
              }}
            >
              知識・技術・指導共有ツール
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <h2 className="sidebar-section-title">メイン機能</h2>
              <div className="sidebar-group">
                <Link
                  href="/dashboard"
                  className={`desktop-nav-item ${pathname === "/dashboard" ? "active" : ""}`}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>💬 タイムライン</span>
                  {unreadCount > 0 && (
                    <span className="sidebar-badge">New</span>
                  )}
                </Link>
                <Link
                  href="/dashboard/columns"
                  className={`desktop-nav-item ${pathname?.startsWith("/dashboard/columns") ? "active" : ""}`}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>📚 コラム・教材</span>
                  {unreadColumnsCount > 0 && (
                    <span className="sidebar-badge">{unreadColumnsCount}</span>
                  )}
                </Link>
                <Link
                  href="/dashboard/notes"
                  className={`desktop-nav-item ${pathname?.startsWith("/dashboard/notes") ? "active" : ""}`}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>📓 野球ノート</span>
                  {unrepliedNotesCount > 0 && (
                    <span className="sidebar-badge">{unrepliedNotesCount}</span>
                  )}
                </Link>
                <Link
                  href="/dashboard/messages"
                  className={`desktop-nav-item ${pathname?.startsWith("/dashboard/messages") ? "active" : ""}`}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>✉️ メッセージ</span>
                  {unreadMessagesCount > 0 && (
                    <span className="sidebar-badge">{unreadMessagesCount}</span>
                  )}
                </Link>
              </div>
            </div>

            <div>
              <h2 className="sidebar-section-title">メンバー・設定</h2>
              <div className="sidebar-group">
                <Link
                  href="/dashboard/roster"
                  className={`desktop-nav-item ${pathname?.startsWith("/dashboard/roster") ? "active" : ""}`}
                >
                  👥 チーム名簿・グループ
                </Link>
                <Link
                  href="/dashboard/profile"
                  className={`desktop-nav-item ${pathname?.startsWith("/dashboard/profile") ? "active" : ""}`}
                >
                  👤 マイページ
                </Link>
                {isManager && (
                  <Link
                    href="/dashboard/settings"
                    className={`desktop-nav-item ${pathname?.startsWith("/dashboard/settings") ? "active" : ""}`}
                  >
                    ⚙️ チーム設定
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .bottom-nav {
          display: none;
        }
        .desktop-sidebar {
          display: none;
        }

        .btn-clean {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          outline: none;
        }

        @media (max-width: 768px) {
          .bottom-nav {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(15px);
            border-top: 1px solid var(--border);
            z-index: 1000;
            padding: 8px 6px;
            padding-bottom: calc(8px + env(safe-area-inset-bottom, 12px));
            justify-content: space-around;
          }

          .bottom-nav .nav-item {
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

          .bottom-nav .nav-item.active {
            color: var(--primary);
          }

          .bottom-nav .icon {
            font-size: 20px;
          }

          .bottom-nav .label {
            font-size: 10px;
            font-weight: 600;
          }

          .badge-dot {
            position: absolute;
            top: 2px;
            right: 14px;
            background: var(--danger);
            color: #fff;
            font-size: 9px;
            font-weight: bold;
            border-radius: 10px;
            padding: 2px 5px;
            line-height: 1;
          }

          .badge-count {
            position: absolute;
            top: 2px;
            right: 10px;
            background: var(--danger);
            color: #fff;
            font-size: 9px;
            font-weight: bold;
            border-radius: 10px;
            padding: 2px 5px;
            line-height: 1;
          }

          .drawer-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 2000;
            backdrop-filter: blur(4px);
          }

          .drawer-card {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(20px);
            border-top: 1px solid var(--border);
            border-radius: 20px 20px 0 0;
            padding: 20px 24px;
            padding-bottom: calc(24px + env(safe-area-inset-bottom, 16px));
            z-index: 2001;
          }

          .drawer-header {
            text-align: center;
            margin-bottom: 20px;
          }

          .drawer-handle {
            width: 40px;
            height: 4px;
            background: var(--border);
            border-radius: 4px;
            margin: 0 auto 12px auto;
          }

          .drawer-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 20px;
          }

          .drawer-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: 16px 12px;
            text-decoration: none;
            color: var(--text-main);
            gap: 8px;
            transition: var(--transition);
          }

          .drawer-item:active {
            transform: scale(0.97);
            border-color: var(--primary);
          }

          .drawer-icon {
            font-size: 24px;
          }

          .drawer-label {
            font-size: 12px;
            font-weight: 700;
          }

          .drawer-close-btn {
            width: 100%;
            padding: 12px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            color: var(--text-muted);
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
          }
        }

        @media (min-width: 769px) {
          .desktop-sidebar {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            width: 240px;
            height: 100vh;
            background: var(--surface);
            border-right: 1px solid var(--border);
            z-index: 100;
            overflow-y: auto;
          }

          .sidebar-section-title {
            font-size: 11px;
            font-weight: 800;
            color: var(--text-muted);
            letter-spacing: 1px;
            margin-bottom: 8px;
            padding: 0 8px;
          }

          .sidebar-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .desktop-nav-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            border-radius: var(--radius-sm);
            color: var(--text-main);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            transition: var(--transition);
          }

          .desktop-nav-item:hover {
            background: rgba(255, 255, 255, 0.05);
          }

          .desktop-nav-item.active {
            background: rgba(255, 107, 0, 0.15);
            color: var(--primary);
            font-weight: 800;
          }

          .sidebar-badge {
            background: var(--danger);
            color: #fff;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 10px;
          }
        }
      `,
        }}
      />
    </>
  );
}
