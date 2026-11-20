# 打席ごとデータ（`plate_appearances`）の窓口と AI 分析 — 設計（案・2026-11-20）

> **前提（オーナー決定 2026-11-20）**:
> - AI 分析は、**打席ごとのデータの窓口を先に設計してから**進める（同意・契約が要る）。
> - 子どもの成績を AI（SKILLBASE）に渡すときは、**名前を送らず、数字（集計・要約）だけ**にする（`BASE_STATS_DB_DESIGN.md` の 7）。
> - `source = 'SKILLBASE_SIMPLE'`（試合ごとの簡易入力）の試合には打席ごとの行がないため、打席詳細を使う分析は `source = 'RECBASE'` の試合を対象とする。

---

## 1. 窓口の役割とエンドポイント（案）
- **エンドポイント**: `GET /api/id/base-pa-summary?userId=<対象選手>&from=&to=&kind=`
  - 置き場所: BASE 共通窓口（`homebase.easystance.app` → `id.easystance.app`）
  - 読み取り元: BASE 共通の成績データベース（D1 `base-stats` の `plate_appearances` 表 × `games` 表）
  - **なぜ生の打席一覧ではなく「要約（`base-pa-summary`）」または「匿名化した打席集計」を返すか**:
    1. 計算の式（カウント別・初球・打球方向・打球質・得点圏など）を BASE 共通の純粋関数に集約し、RECBASE・SKILLBASE で数字が食い違わないようにするため（`SKILLBASE_LINK_DESIGN.md` 8-3）。
    2. 通信量を小さくし、SKILLBASE が AI に渡す際にも「名前・生年月日・チーム名を含まない数値要約 JSON」をそのまま安全に渡せるようにするため。

---

## 2. 窓口で確認する 3 つの条件（ガード）
1. **閲覧権限（`guardViewer` 準拠）**:
   - 本人（`self`）、ひもづけた保護者（`children`）、またはチームの閲覧権限で許された指導者・メンバー（`team`）であること。
2. **契約の確認（`productsForTeam`）**:
   - チームが SCOREBASE（成績同期）と SKILLBASE（AI分析対象プラン）の契約条件を満たしていること。未契約なら `403 { error: "plan" }`。
3. **保護者の同意（18歳未満・子どもデータの外部 AI 送信への同意）**:
   - 子どもの打席・成績データを外部 AI（Anthropic Claude API）で分析するにあたり、チーム／保護者の同意フラグ（`aiAnalysisConsent`）が有効であることを確認する。未同意なら `403 { error: "consent-required" }` を返し、AI には一切送信しない。

---

## 3. 返す中身（名前を含まない数値要約）
```json
{
  "gamesCount": 12,
  "paCount": 38,
  "byCount": {
    "firstPitch": { "pa": 14, "ab": 13, "hits": 6 },
    "twoStrikes": { "pa": 15, "ab": 14, "hits": 3, "so": 5 },
    "aheadInCount": { "pa": 9, "ab": 7, "hits": 4, "bb": 2 }
  },
  "byTrajectory": {
    "GROUNDER": { "ab": 15, "hits": 4 },
    "LINER": { "ab": 6, "hits": 5 },
    "FLY": { "ab": 9, "hits": 3 },
    "POPUP": { "ab": 2, "hits": 0 },
    "BUNT": { "pa": 2, "sh": 1 }
  },
  "byCourse": {
    "left": 11,
    "center": 10,
    "right": 7
  },
  "risp": { "ab": 11, "hits": 4, "rbi": 7 }
}
```
- **絶対に入れないもの**: 選手名・チーム名・対戦相手名・生年月日・学校・住所・連絡先。

---

## 4. 進める順番（オーナー確認後）
1. 窓口側で `GET /api/id/base-pa-summary` の純粋計算関数と単体テストを作る。
2. 契約条件（どのプランで開放するか）と、保護者・指導者の AI 分析同意の確認方法を決める。
3. その後に SKILLBASE 側の分析カード表示・練習コラム提案をつなぐ。
