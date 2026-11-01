import HomeClient from "./HomeClient";

// LPを常に最新配信（no-store）にする。
// これが無いと静的ページ扱いで長期キャッシュ(s-maxage=1年)され、
// デプロイしても端末/CDNが古いHTMLを掴んで更新が反映されない。
export const dynamic = "force-dynamic";

export default function Page() {
  return <HomeClient />;
}
