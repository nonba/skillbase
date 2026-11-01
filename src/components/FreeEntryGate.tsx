"use client";

import { usePathname } from "next/navigation";
import FreeEntryPaywall from "./FreeEntryPaywall";

// FREE_ENTRY(入団申込み・団費管理のみの無料枠)チームが、HOMEBASE本体側のページを直接開いた時、
// 実際のページの代わりにFreeEntryPaywallを表示する(2026-09-02追加)。
// dashboard/layout.tsxで{children}をこれで包むだけで済むよう、経路判定をここに集約している。
const FULL_FEATURE_PATHS: { prefix: string; name: string }[] = [
  { prefix: "/dashboard/schedule", name: "カレンダー・出欠管理" },
  { prefix: "/dashboard/messages", name: "メッセージ" },
  { prefix: "/dashboard/roster", name: "チーム名簿" },
  { prefix: "/dashboard/stats", name: "成績管理" },
  { prefix: "/dashboard/album", name: "アルバム" },
];

export default function FreeEntryGate({ tier, children }: { tier: string | null; children: React.ReactNode }) {
  const pathname = usePathname();

  if (tier !== "FREE_ENTRY") return <>{children}</>;

  // "/dashboard"ルート自体はdashboard/page.tsx側で/attach/adminへリダイレクトするため、
  // ここではPR画面を出さない(2026-09-03、Attachエリア新設に伴う変更)。
  const matched = FULL_FEATURE_PATHS.find((f) => pathname?.startsWith(f.prefix));
  if (matched) {
    return <FreeEntryPaywall featureName={matched.name} />;
  }

  return <>{children}</>;
}
