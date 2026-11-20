import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBaseIdUrl, getIdTicketSecret } from "@/lib/env";
import { signTicket } from "@/lib/baseTicket";

// BASE 共有の成績データベース（base-stats / base-games）を、窓口（BASE_ID_URL）経由で読んで返す（2026-11-20 更新）。
// ・見せる範囲＝「BASE シリーズに準ずる」。SKILLBASE 独自の決まりを作らず、窓口の決まり
//   （self＝自分は常に ／ children＝ひもづけた子ども ／ team＝スコアを付けられる人、または「チーム全体成績の閲覧権限」で許された人）をそのまま使う。
// ・選手本人（小学生を含む）も、シリーズどおり、自分の成績を見られる（PLAYER_CAN_VIEW_OWN = true）。
// ・成績の正は BASE 共有（base-stats）。SKILLBASE は読んで出すだけ（保存しない）。

const PLAYER_CAN_VIEW_OWN = true;

type Scope = "self" | "children" | "team";

function randomState(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return "srv-" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "login" }, { status: 401, headers });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, baseUserId: true, role: true },
  });
  if (!user?.baseUserId) return NextResponse.json({ linked: false }, { headers });
  if (user.role === "PLAYER" && !PLAYER_CAN_VIEW_OWN) {
    return NextResponse.json({ linked: true, hidden: true }, { headers });
  }

  const reqUrl = new URL(req.url);
  const secret = getIdTicketSecret();
  const idBase = getBaseIdUrl(reqUrl.origin);
  if (secret.length < 32 || !/^https?:\/\//.test(idBase)) {
    return NextResponse.json({ linked: true, error: "unavailable" }, { status: 503, headers });
  }

  const requestedScope = reqUrl.searchParams.get("scope") as Scope | null;
  const from = reqUrl.searchParams.get("from") ?? "";
  const to = reqUrl.searchParams.get("to") ?? "";
  const kind = reqUrl.searchParams.get("kind") ?? "";

  try {
    const ticket = await signTicket(
      { sub: user.baseUserId, name: user.name, teamId: null, aud: "stats-read", state: randomState() },
      secret
    );
    const authHeaders = { Authorization: `Bearer ${ticket}` };

    const buildFilterParams = (extra: Record<string, string> = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(extra)) {
        if (v) sp.set(k, v);
      }
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      if (kind === "OFFICIAL" || kind === "PRACTICE") sp.set("kind", kind);
      const qs = sp.toString();
      return qs ? `?${qs}` : "";
    };

    const callBaseStats = (sc: Scope) =>
      fetch(`${idBase}/api/id/base-stats${buildFilterParams({ scope: sc })}`, {
        headers: authHeaders,
        cache: "no-store",
      });

    const callBaseGames = () =>
      fetch(`${idBase}/api/id/base-games${buildFilterParams()}`, {
        headers: authHeaders,
        cache: "no-store",
      });

    // 初期のスコープ順序を役割に応じて決める（最終判定は窓口が行う。403 forbidden なら次のスコープへフォールバック）
    const defaultOrder: Scope[] =
      requestedScope && ["self", "children", "team"].includes(requestedScope)
        ? [requestedScope, "self", "children", "team"]
        : user.role === "MANAGER"
          ? ["team", "children", "self"]
          : user.role === "PARENT"
            ? ["children", "team", "self"]
            : ["self", "team", "children"];
    const tryOrder = [...new Set(defaultOrder)];

    let firstRes = await callBaseStats(tryOrder[0]);

    // 窓口側で base-stats が使える場合（200 または 403 no-team / plan / forbidden）
    if (firstRes.status === 200 || firstRes.status === 403 || firstRes.status === 400) {
      let activeScope = tryOrder[0];
      let activeRes = firstRes;
      let firstBody = (await activeRes.json().catch(() => ({}))) as Record<string, unknown>;

      // チーム未所属（no-team）や未契約（plan）はそのまま案内へ返す
      if (activeRes.status === 403 && (firstBody.error === "no-team" || firstBody.error === "plan")) {
        return NextResponse.json(
          { linked: true, reason: firstBody.error as string, source: "base-stats" },
          { status: 200, headers }
        );
      }

      // scope=team が forbidden の場合や、children が 0 人の場合は次の候補を試す
      if (
        (activeRes.status === 403 && firstBody.error === "forbidden") ||
        (!requestedScope &&
          activeScope === "children" &&
          Array.isArray(firstBody.players) &&
          firstBody.players.length === 0)
      ) {
        for (const nextScope of tryOrder.slice(1)) {
          const r = await callBaseStats(nextScope);
          const b = (await r.json().catch(() => ({}))) as Record<string, unknown>;
          if (r.ok) {
            if (
              !requestedScope &&
              nextScope === "children" &&
              Array.isArray(b.players) &&
              b.players.length === 0
            ) {
              continue;
            }
            activeScope = nextScope;
            activeRes = r;
            firstBody = b;
            break;
          }
        }
      }

      if (!activeRes.ok) {
        return NextResponse.json(
          { linked: true, error: (firstBody.error as string) ?? "unavailable" },
          { status: activeRes.status === 403 ? 200 : 502, headers }
        );
      }

      // 試合一覧（base-games）も並行取得
      const gamesRes = await callBaseGames();
      const gamesBody = gamesRes.ok
        ? ((await gamesRes.json().catch(() => ({}))) as { games?: unknown[] })
        : { games: [] };

      return NextResponse.json(
        {
          linked: true,
          source: "base-stats",
          role: user.role,
          scope: activeScope,
          players: (firstBody.players as unknown[]) ?? [],
          batting: (firstBody.batting as unknown[]) ?? [],
          running: (firstBody.running as unknown[]) ?? [],
          pitching: (firstBody.pitching as unknown[]) ?? [],
          games: gamesBody.games ?? [],
        },
        { headers }
      );
    }

    // フォールバック: 旧 /api/id/player-stats（base-stats が 401/404 の環境向け互換）
    const legacyQuery =
      (requestedScope ?? (user.role === "MANAGER" ? "team" : user.role === "PARENT" ? "children" : "self")) === "team"
        ? "?all=1"
        : (requestedScope ?? (user.role === "PARENT" ? "children" : "self")) === "children"
          ? "?scope=children"
          : "";
    const callLegacy = (q: string) =>
      fetch(`${idBase}/api/id/player-stats${q}`, { headers: authHeaders, cache: "no-store" });

    let res = await callLegacy(legacyQuery);
    if (res.status === 403 && legacyQuery) res = await callLegacy("");
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 403 && (j.error === "no-team" || j.error === "plan")) {
        return NextResponse.json({ linked: true, reason: j.error, source: "player-stats" }, { status: 200, headers });
      }
      return NextResponse.json(
        { linked: true, error: j.error ?? "unavailable" },
        { status: res.status === 403 ? 200 : 502, headers }
      );
    }
    const j = (await res.json()) as { players?: unknown[] };
    return NextResponse.json(
      {
        linked: true,
        source: "player-stats",
        role: user.role,
        scope: legacyQuery === "?all=1" ? "team" : legacyQuery === "?scope=children" ? "children" : "self",
        players: j.players ?? [],
      },
      { headers }
    );
  } catch {
    return NextResponse.json({ linked: true, error: "unavailable" }, { status: 502, headers });
  }
}
