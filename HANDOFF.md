# ⚡ SKILLBASE 引き継ぎ・進行状況（2026-11-24 更新 / PC03）

## 0. 本日（2026-11-24）完了した整理・改修内容
HOMEBASE 由来で重複していた機能・ルール外UIを整理し、**タイムライン・コラム・野球ノート・メッセージ・個人成績（＋簡易入力）・OB（`/ob`：お知らせ＋メッセージのみ）** に特化した構成へスリム化しました：
- **削除・整理した画面・導線**:
  - アルバム・ハイライト（`/dashboard/album/highlights`、`/dashboard` のアルバムタブ・`HighlightCarousel`）を削除
  - 家族用ページ・印刷（`/family/[token]/*`）を削除
  - 公開チームプロフィール（`/team-profile/[teamId]` および `/dashboard/settings` 内の設定カード）を削除
  - 通話機能（`DashboardLayout` の `GlobalCallListener`、`/dashboard/messages/[conversationId]` の通話/ビデオボタン・`CallOverlay`）を削除
  - 料金・課金プラン・ストレージ追加・会費Pay登録UI（`/dashboard/settings` 内の契約・決済セクション）を撤去（Apple 3.1.1・2026-11-24 ルール準拠、`statsVisibility` 公開範囲設定は維持）
- **AI 成績分析（2026-11-24 実装）**:
  - [`src/lib/aiStatsAnalysis.ts`](file:///W:/skillbase/src/lib/aiStatsAnalysis.ts): 名前・チーム名を含まない匿名数値要約サニタイザー＋派生指標計算＋Claude API（`ANTHROPIC_API_KEY`）連携＋キー未設定時のローカル試算フォールバック。
  - [`src/app/api/ai/analyze-stats/route.ts`](file:///W:/skillbase/src/app/api/ai/analyze-stats/route.ts): `POST /api/ai/analyze-stats`（ログイン＋`aiConsent === true` 必須ガード）。
  - [`src/components/AiStatsAnalysisPanel.tsx`](file:///W:/skillbase/src/components/AiStatsAnalysisPanel.tsx): 外部AI送信同意UI付き分析パネルを [`BaseStatsCard.tsx`](file:///W:/skillbase/src/components/BaseStatsCard.tsx)（RECBASE連携）と [`SimpleStatsPrototypeCard.tsx`](file:///W:/skillbase/src/components/SimpleStatsPrototypeCard.tsx)（手入力集計）の両方に組み込み済み。
- **検証**: `npx next typegen && npx tsc --noEmit` 通過（エラー 0件）
- **今後の重要要件（2026-11-24 オーナー指示・忘れないこと）**:
  1. **OB（卒団生）の BASE シリーズ統一活用**: HOMEBASE 側の学年更新で卒団（`graduated`）したユーザーもそのまま OB として `/ob`（お知らせタイムライン＋メッセージのみ）を利用でき、タイムライン投稿の配信対象先として「OB」を使える仕様を維持・`base-master` にも引き継ぐ。
  2. **AI 成績分析（RECBASE 連携 ＋ 手入力集計の両対応）**: `RECBASE` 連携時（打席詳細あり）の詳細 AI 分析だけでなく、**RECBASE 未連携でも手入力（簡易集計）が入っている場合も数値要約から AI 分析できる機能** を必ず実装する（名前なし・数値のみ送信＋同意必須、詳細は [`docs/AI_PA_WINDOW_DESIGN.md`](file:///W:/skillbase/docs/AI_PA_WINDOW_DESIGN.md)）。

---

# ⚡ SKILLBASE 引き継ぎ・進行状況（2026-11-20 19:23 更新 / nonbaPC 引き継ぎ）

## 1. 現在のブランチ・運用状態
- **作業ディレクトリ**: `W:\skillbase`（PC03: `C:\workspace\skillbase` / nonbaPC: `D:\workspace\skillbase`）
- **ブランチ**: `main` および `proto/base-login` の両方を最新状態で GitHub（`origin`）へ push 済み（自動デプロイは解除済みのため push 自体は安全）。
- **本番リリース状況**: 未リリース（Worker `skillbase-app`・D1 `skillbase-db`・R2 共用）

---

## 2. 本日（2026-11-20）完了した実装・改修内容

### ✅ ① 選手本人の成績閲覧の開放（`PLAYER_CAN_VIEW_OWN = true`）
- [`src/app/api/base/player-stats/route.ts`](file:///W:/skillbase/src/app/api/base/player-stats/route.ts) の `PLAYER_CAN_VIEW_OWN` を `true` に変更。
- 小学生を含む選手本人も、BASE シリーズ準拠で自分の成績を閲覧可能。

### ✅ ② ログイン中の立場（`role`）＆ チームの閲覧権限（`statsVisibility`）に応じた成績範囲ボタンの自動出し分け
- [`src/components/BaseStatsCard.tsx`](file:///C:/Users/nonba/OneDrive/skillbase/src/components/BaseStatsCard.tsx) および [`src/app/dashboard/settings/page.tsx`](file:///C:/Users/nonba/OneDrive/skillbase/src/app/dashboard/settings/page.tsx) にて、立場とチームの公開設定（`canViewTeam`）に完全連動：
  - **⚾ 選手本人 (`PLAYER`)**: 「自分の成績 (`self`)」＋（チーム全体公開が許可されているときのみ）「チーム全体 (`team`)」
  - **👪 保護者 (`PARENT`)**: 「お子さんの成績 (`children`)」＋（チーム全体公開が許可されているときのみ）「チーム全体 (`team`)」
  - **👔 指導者 (`MANAGER`)**: 「チーム全体 (`team`)」「お子さんの成績 (`children`)」
  - チーム設定（`/dashboard/settings`）の「👀 成績の公開範囲」で `ALL`（チーム全体も公開）／ `MANAGER_ONLY`（自分・自分の子の成績のみ）／ `SPECIFIC_GROUPS`（特定グループのみ全体公開）をいつでも切り替え可能。

### ✅ ③ 自前ログインでの新規ユーザー作成の廃止（ログインは BASE アカウントだけ）
- [`src/app/login/page.tsx`](file:///W:/skillbase/src/app/login/page.tsx) / [`src/app/register/page.tsx`](file:///W:/skillbase/src/app/register/page.tsx) / [`src/app/HomeClient.tsx`](file:///W:/skillbase/src/app/HomeClient.tsx): 自前のID・パスワード入力フォームや独自の新規登録フォームを外し、「🔑 BASE アカウントでログイン」に一本化。
- [`src/app/api/auth/register/route.ts`](file:///W:/skillbase/src/app/api/auth/register/route.ts) / [`src/app/api/auth/register-manager/route.ts`](file:///W:/skillbase/src/app/api/auth/register-manager/route.ts): `POST` による独自アカウント新規作成を `403` で停止。
- [`src/lib/auth.ts`](file:///W:/skillbase/src/lib/auth.ts): `base-ticket` 認証時、既存 `baseUserId`（または同 `id`）があればそれを使い、未登録の BASE アカウントならパスワードを持たないプロフィール行を自動用意してログイン。
- **ローカル手元確認用シミュレータ**: `NODE_ENV !== "production"` かつ `BASE_ID_URL` 未設定のときは、`/auth/base/dev-sso` ＆ `/api/id/sso` ＆ `/api/id/base-stats` ＆ `/api/id/base-games` が動作し、手元で監督・選手・保護者を選んで本物の署名つき通行証（`baseTicket`）によるログインと成績表示を通しで確認可能。

### ✅ ④ 成績画面の `base-stats`・`base-games` 窓口対応 ＆ 空・未契約時の案内
- [`src/app/api/base/player-stats/route.ts`](file:///W:/skillbase/src/app/api/base/player-stats/route.ts) ＆ [`src/components/BaseStatsCard.tsx`](file:///W:/skillbase/src/components/BaseStatsCard.tsx):
  - `GET /api/id/base-stats?scope=self|children|team` と `GET /api/id/base-games` に優先接続。
  - 「⚾ 打撃」「🏃 走塁」「🎯 投手」「📅 試合一覧（公式戦／練習試合フィルタ対応）」の4タブ表示に対応。
  - 未連携（`unlinked`）・チーム未所属（`no-team`）・連携プラン未契約（`plan` ※ネイティブアプリでは Apple 3.1.1 準拠で契約案内を非表示）・データ空のときの案内を実装。

### ✅ ⑤ 簡易成績入力（Excel風一括入力シート ＋ 全36項目チェック選択・基本6項目テンプレ）
- [`src/components/SimpleStatsPrototypeCard.tsx`](file:///W:/skillbase/src/components/SimpleStatsPrototypeCard.tsx)（マイページ「個人成績」タブ、および確認用 `/proto/stats` に配置）：
  - 「成績を使う／使わない」切り替えスイッチ
  - **Excel風の一括入力シート**に一本化（1人だけでも全員まとめてでもそのまま入力可能、右端に打率・OPS・投球回をリアルタイム自動計算）
  - **「⚙️ 使う項目を選ぶ」** パネル：集計・分析に絡む全36項目（打撃14・走塁9・投手13）を網羅し、テンプレート（「⭐ 基本6項目」「⚾ 打撃・走塁しっかり（17項目）」「📊 フル項目（36項目）」）＋個別チェックボックスで使う列だけを自在にON/OFF可能。
- 設計書: [`docs/STANDALONE_SIMPLE_STATS_DESIGN.md`](file:///W:/skillbase/docs/STANDALONE_SIMPLE_STATS_DESIGN.md)、[`docs/AI_PA_WINDOW_DESIGN.md`](file:///W:/skillbase/docs/AI_PA_WINDOW_DESIGN.md)

### ✅ ⑥ 窓口アドレスの設定差し替え対応（`BASE_ID_URL`）＆ 画面デバッグ枠の非表示化
- [`src/lib/env.ts`](file:///W:/skillbase/src/lib/env.ts) に `getBaseIdUrl()` / `getIdTicketSecret()` を整備。
- [`src/components/GlobalCallListener.tsx`](file:///W:/skillbase/src/components/GlobalCallListener.tsx) の上部黒いデバッグオーバーレイ（`SKILLBASE REALTIME DEBUGGER`）を非表示に修正。

---

## 3. nonbaPC での再開手順
1. `W:\skillbase` で `git pull` を実行（最新コミットを取得）
2. もし nonbaPC 側のローカルDB（`.wrangler` 内）が未初期化の場合は以下で初期データ投入：
   ```powershell
   npx prisma db push --accept-data-loss
   npx prisma db seed
   ```
3. `npm run dev` で起動し、マイページ（`/dashboard/profile`）の「個人成績」タブで立場別（選手／保護者／指導者）の成績範囲ボタン出し分けと Excel風簡易入力シートの続きを確認・調整する。
