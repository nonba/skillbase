# ⚡ SKILLBASE（スキルベース）— プロジェクト引き継ぎ・状況まとめ

> **AIエージェントへ**: ユーザーから「続きお願い」と言われたら、このファイルを読んで **Step 4（パッケージ導入・ローカルDB反映・動作確認）** から進めてください。

## 1. プロジェクト概要
- **アプリ名**: **SKILLBASE（スキルベース）**
- **フォルダパス**: `C:\Users\nonba\OneDrive\skillbase`
- **ベース元**: `C:\Users\nonba\OneDrive\baseball-saas`（HOMEBASE）
- **コンセプト**:
  - 野球チームオーナーからの要望で生まれた、「指導・育成・野球知識の共有」に特化した会員制教育・コミュニケーションツール。
  - HOMEBASEから余分なチーム管理機能（スケジュール・出欠・配車・試合スコア・団費計算・入団申込フォーム等）を削ぎ落とし、以下の **3本柱＋名簿管理** にスリム化。
    1. 📚 **コラム・教材ライブラリ**（`/dashboard/columns`）
    2. 💬 **タイムライン＆アルバム**（`/dashboard`）
    3. ✉️ **DM（メッセージ）＆ WebRTC音声・ビデオ通話**（`/dashboard/messages`）
    4. 👥 **チーム名簿・学年・グループ管理・設定**（`/dashboard/roster`, `/dashboard/profile`, `/dashboard/settings`）

---

## 2. 完了している作業（Step 1〜Step 3 完了済み）

### ✅ Step 1: Prismaスキーマ拡張（`prisma/schema.prisma`）
- 新規モデルを追加済み：
  - `Column`（タイトル、解説本文、9カテゴリー、YouTube URL、R2動画URL、R2画像URL、添付資料PDF URL/ファイル名、ピン留め、コメント許可フラグ、配信対象設定：`ALL` 全学年 / `GRADES` 学年指定 / `GROUPS` グループ指定 / `USERS` 個別選手指定）
  - `ColumnRead`（選手の「見たよ！（学習完了）」既読記録）
  - `ColumnBookmark`（選手のブックマーク保存）
  - `ColumnComment`（質問・感想コメント）

### ✅ Step 2: ナビゲーション＆画面の「SKILLBASE」化
- `src/components/BottomNav.tsx`: スマホ下部ナビ・PC左サイドバーを「💬 タイムライン」「📚 コラム・教材（未読バッジ付）」「✉️ メッセージ」「☰ メニュー」の4項目に刷新
- `src/app/dashboard/layout.tsx`: `AreaSwitchBar` / `FreeEntryGate` を外し、通話待受（`GlobalCallListener`）と通知（`PushNotificationManager`）を維持
- `src/app/dashboard/page.tsx`: スケジュール・スコア表示を除去し、タイムライン最上部に「📚 未読のコラム・教材ピックアップバナー」を表示
- `src/app/HomeClient.tsx`, `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/layout.tsx`: すべて `⚡ SKILLBASE` 表記・デザインに刷新

### ✅ Step 3: コラム・教材ライブラリ API ＆ 画面実装
- `src/lib/columns.ts`: 9カテゴリー定義（打撃・投球・守備・走塁・トレーニング・メンタル・食育・戦術・その他）＆ YouTube URL（通常/短縮/Shorts/複数）からのVideo ID抽出ヘルパー
- `src/app/api/columns/route.ts`: 一覧取得（ログインユーザーの学年・所属グループ・個別指定・親子関係に応じた閲覧フィルタ＋未読数算出）＆ 新規作成（対象者へのWebPush/FCM通知付き）
- `src/app/api/columns/[id]/route.ts`: 詳細取得（指導者向けに「✅ 見たよ済みの選手」と「⏳ まだ見ていない対象選手」を自動算出して返却）、編集（PUT）、削除（DELETE）
- `src/app/api/columns/[id]/read/route.ts`: 「👀 見たよ！（学習完了）」トグルAPI
- `src/app/api/columns/[id]/bookmark/route.ts`: ブックマーク保存トグルAPI
- `src/app/api/columns/[id]/comment/route.ts`: 質問・感想コメント投稿＆削除API
- `src/app/dashboard/columns/page.tsx`: コラム一覧画面＆指導者用の新規配信モーダル（全学年 / 学年複数選択 / グループ選択 / 個別選手選択、YouTubeリアルタイムプレビュー、R2動画・画像・PDF添付）
- `src/app/dashboard/columns/[id]/page.tsx`: コラム詳細画面（YouTube埋め込み再生、R2動画再生、画像ギャラリー、PDF資料ダウンロード、見出し対応本文、「見たよ！」ボタン、指導者用の既読・未読メンバー確認パネル、コメント欄）

---

## 3. Step 4 & Cloudflare本番デプロイ完了内容

1. **パッケージ導入とPrismaクライアント生成**
   - `npm install` ＆ `npx prisma generate` 完了
2. **ローカルD1 ＆ CloudflareリモートD1（`skillbase-db`）構築・初期データ投入**
   - [wrangler.jsonc](file:///c:/Users/nonba/OneDrive/skillbase/wrangler.jsonc) を `skillbase-app` / `skillbase-db`（DB ID: `19f4e234-1b57-4fe3-ad08-356391939a87`）に更新
   - カスタムドメイン: `https://skillbase.easystance.app`
   - [0019_skillbase_columns.sql](file:///c:/Users/nonba/OneDrive/skillbase/prisma/migrations/0019_skillbase_columns.sql) を追加し、ローカル・本番D1双方へ全テーブル＆初期サンプルデータ（チーム・指導者・選手・保護者・コラム教材3件）を反映済み
3. **テスト用ログインアカウント（ローカル・本番共通 / パスワード: `password123`）**
   - **監督（指導者）**: `manager1@example.com` / `password123`
   - **コーチ（指導者）**: `manager2@example.com` / `password123`
   - **選手（6年生）**: `player1@example.com` / `password123`
   - **保護者**: `parent1@example.com` / `password123`
