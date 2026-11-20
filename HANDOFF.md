# ⚡ SKILLBASE 引き継ぎ・進行状況（2026-11-20 更新）

## 1. 現在のブランチ・運用状態
- **作業ディレクトリ**: `W:\skillbase`（PC03: `C:\workspace\skillbase` / nonbaPC: `D:\workspace\skillbase`）
- **作業ブランチ**: `proto/base-login`（**手元のみ・本番や origin へは push しない**）
- **本番リリース状況**: 未リリース（Worker `skillbase-app`・D1 `skillbase-db`・R2 共用）

---

## 2. オーナー決定事項（2026-11-20）と反映完了内容

### ✅ ① 選手本人の成績閲覧の開放（`PLAYER_CAN_VIEW_OWN = true`）
- [`src/app/api/base/player-stats/route.ts`](file:///W:/skillbase/src/app/api/base/player-stats/route.ts) の `PLAYER_CAN_VIEW_OWN` を `true` に変更。
- 小学生を含む選手本人も、BASE シリーズの決まりどおり自分の成績を閲覧可能（年齢による追加制限は行わない）。

### ✅ ② `proto/base-login` 通し確認（手元）
- 署名つき通行証（[`src/lib/baseTicket.ts`](file:///W:/skillbase/src/lib/baseTicket.ts)）の発行・検証・期限切れ拒否・宛先(`aud: "skillbase"` / `"stats-read"`)チェック・改ざん拒否・TypeScript 型チェック（エラー 0 件）を通しで確認済み。

### ✅ ③ 自前ログインでの新規ユーザー作成の廃止（ログインは BASE アカウントだけ）
- [`src/app/login/page.tsx`](file:///W:/skillbase/src/app/login/page.tsx): 自前 ID・パスワード入力フォームと新規登録導線を外し、「🔑 BASE アカウントでログイン」に一本化。
- [`src/app/register/page.tsx`](file:///W:/skillbase/src/app/register/page.tsx) / [`src/app/HomeClient.tsx`](file:///W:/skillbase/src/app/HomeClient.tsx): 独自の新規登録フォームを廃止し、BASE アカウントでのログインへ案内。
- [`src/app/api/auth/register/route.ts`](file:///W:/skillbase/src/app/api/auth/register/route.ts) / [`src/app/api/auth/register-manager/route.ts`](file:///W:/skillbase/src/app/api/auth/register-manager/route.ts): `POST` による独自アカウント新規作成を `403` で停止。
- [`src/lib/auth.ts`](file:///W:/skillbase/src/lib/auth.ts): `base-ticket` 認証時、既存 `baseUserId`（または同 `id`）があればそれを使い、未登録の BASE アカウントならパスワードを持たないプロフィール行を自動用意してそのままログインできる形に更新。

### ✅ ④ 成績画面の `base-stats`・`base-games` 窓口対応 ＆ 空・未契約時の案内
- [`src/app/api/base/player-stats/route.ts`](file:///W:/skillbase/src/app/api/base/player-stats/route.ts) ＆ [`src/components/BaseStatsCard.tsx`](file:///W:/skillbase/src/components/BaseStatsCard.tsx):
  - BASE 共有の成績データベースを読む窓口（`GET /api/id/base-stats?scope=self|children|team` および `GET /api/id/base-games`）に優先接続（旧 `player-stats` への自動フォールバック互換つき）。
  - 閲覧範囲は BASE シリーズ準拠（`self`＝自分 ／ `children`＝ひもづけた子ども ／ `team`＝チーム全体）。
  - 「⚾ 打撃（打率・出塁率・長打率・OPS・得点圏・二塁打・三塁打・本塁打・打点・四死球・三振・犠打飛）」「🏃 走塁（盗塁・盗塁成功率・得点・生還率・余分進塁・タッチアップ）」「🎯 投手（防御率・登板・投球回・球数・奪三振・与四死球など）」「📅 試合一覧（公式戦／練習試合フィルタ対応）」の4タブ表示に対応。
  - 未連携（`unlinked`）・チーム未所属（`no-team`）・連携プラン未契約（`plan` ※ネイティブアプリでは Apple 3.1.1 準拠で契約案内を非表示）・データ空のときの案内を実装。

### ✅ ⑤ AI 分析のための「打席ごとデータの窓口」設計
- [`docs/AI_PA_WINDOW_DESIGN.md`](file:///W:/skillbase/docs/AI_PA_WINDOW_DESIGN.md) に、匿名化した打席要約窓口（`GET /api/id/base-pa-summary`）の仕様と、閲覧権限・契約・保護者/チームの AI 分析同意の 3 段階ガード設計をまとめ済み。

### ✅ ⑥ 窓口アドレスの設定差し替え対応（`BASE_ID_URL`）
- [`src/lib/env.ts`](file:///W:/skillbase/src/lib/env.ts) に `getBaseIdUrl()` を追加し、環境変数 `BASE_ID_URL` の設定変更だけで `https://homebase.easystance.app` → `https://id.easystance.app` へ一括差し替え可能に統一。

### ✅ ⑦ SKILLBASE 単独チームの「成績を使う・使わない」選択と簡易入力（画面試作＋設計）
- 設計書: [`docs/STANDALONE_SIMPLE_STATS_DESIGN.md`](file:///W:/skillbase/docs/STANDALONE_SIMPLE_STATS_DESIGN.md)（`source: 'RECBASE' | 'SKILLBASE_SIMPLE'` の区別案、窓口分離・チームの核共通化の依存整理）。
- 画面試作: [`src/components/SimpleStatsPrototypeCard.tsx`](file:///W:/skillbase/src/components/SimpleStatsPrototypeCard.tsx) をマイページ「個人成績」タブ（[`src/app/dashboard/profile/page.tsx`](file:///W:/skillbase/src/app/dashboard/profile/page.tsx)）に配置。「成績を使う／使わない」の切り替えと、試合ごとの個人合計（基本項目＋任意で詳細打撃・走塁・投手）の簡易入力プレビューが画面上で確認可能。

---

## 3. 次に相談・確認したいポイント
1. **窓口側（`homebase-id-proto` の `guardViewer` / `appAuth.ts`）のサーバー間通行証対応**:
   - 現在 `homebase-id-proto` の `GET /api/id/base-stats` と `GET /api/id/base-games` が使う `guardViewer`（`getAppOrWebSession`）は、iOSアプリの `AppToken`（40〜64文字）またはブラウザ Cookie のみを受け付け、SKILLBASE サーバーが発行する `Bearer <stats-read 署名つき通行証>` をまだ通していません（旧 `player-stats` には `verifyTicket(bearer, secret, "stats-read")` が入っています）。
   - `homebase-id-proto` 側の `getAppOrWebSession`（または `guardViewer`）にも `stats-read` 通行証の検証を足してよいか。
2. **単独チーム向けの簡易成績入力（`SimpleStatsPrototypeCard`）の項目・画面の粒度確認**
3. **AI 分析窓口（`docs/AI_PA_WINDOW_DESIGN.md`）の同意・契約仕様の確認**
