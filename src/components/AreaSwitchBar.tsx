"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

// 「入団・団費管理(SKILLBASE Attach)」⇔「SKILLBASE本体」の常設切り替えバー(2026-09-03新設→
// 一度PC03側の判断で撤去→オーナーの希望で鍵アイコン付きで復活)。
// 経緯: 最初は常時同じ見た目のタブだったため、FREE_ENTRYチームが「SKILLBASE」タブに触れるたびに
// 予告なく料金案内画面へ飛ばされ「気持ち悪い」という指摘があった。今回は事前に🔒を出して
// 「これは有料機能です」と分かった上で踏めるようにし、実際に踏むと(/dashboard/scheduleへ誘導し)
// FreeEntryPaywallの料金案内が表示される。FULLチームには🔒を付けず、素の/dashboardへリンクする。
const ENTRY_AREA_PREFIXES = ["/attach"];

export default function AreaSwitchBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: teamRes } = useSWR(session?.user ? "/api/team/info" : null, fetcher);
  const isFreeEntry = teamRes?.team?.tier === "FREE_ENTRY";

  const inEntryArea = ENTRY_AREA_PREFIXES.some((p) => pathname?.startsWith(p));
  // FREE_ENTRYは/dashboard直行だと即/attach/adminへリダイレクトされ料金案内が出せないため、
  // 必ずFreeEntryPaywallが表示される非ルートパスへ誘導する。
  const homebaseHref = isFreeEntry ? "/dashboard/schedule" : "/dashboard";

  return (
    <div className="area-switch-bar">
      <Link href={homebaseHref} className={`area-switch-bar-item ${!inEntryArea ? "active" : ""}`}>
        {isFreeEntry && <span style={{ marginRight: "4px" }}>🔒</span>}
        🏠 SKILLBASE
      </Link>
      <Link href="/attach/team-roster" className={`area-switch-bar-item ${inEntryArea ? "active" : ""}`}>
        📋 SKILLBASE Attach
      </Link>

      <style dangerouslySetInnerHTML={{__html: `
        .area-switch-bar {
          position: sticky;
          top: 0;
          z-index: 90;
          display: flex;
          gap: 4px;
          padding: 6px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
        }

        .area-switch-bar-item {
          flex: 1;
          text-align: center;
          padding: 8px 6px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
          text-decoration: none;
          border-radius: var(--radius-sm);
          transition: var(--transition);
        }

        .area-switch-bar-item.active {
          background: var(--primary);
          color: #fff;
        }

        @media (min-width: 769px) {
          .area-switch-bar {
            max-width: 360px;
            margin: 0 auto;
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
            margin-top: 12px;
            margin-bottom: 4px;
            position: static;
          }
        }
      `}} />
    </div>
  );
}
