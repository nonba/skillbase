# SKILLBASE 単独チームの簡易成績入力 — 設計（案・2026-11-20）

> **前提（オーナー決定 2026-11-20）**:
> - SKILLBASE だけを使うチーム（SCOREBASE / HOMEBASE を併用しないチーム）は、**成績機能を「使う・使わない」を選べる**。
> - 「使う」場合は、打席ごとではなく **試合ごとの個人結果（打撃・投球・走塁の合計）を簡易に打ち込める**ように開放する（入力の細かさは任意）。
> - **現段階の範囲**: 実際の書き込みには「① 窓口の分離（`NEXT_PREP_DESIGNS ①`）」と「② チームの核（ID・名前）の BASE 共通化（`BASE_ID_DESIGN 2.7`）」が先決となるため、**それまでは設計と画面の試作まで**（DB への本番書き込みは行わない）。

---

## 1. チームごとの「成績を使う・使わない」選択
- **設定項目**: チーム設定（または個人成績タブの管理者設定）に `useSimpleStats: boolean`（成績機能を使う／使わない）を設ける。
  - **使わない（OFF）**: 個人成績タブやノート連携の成績枠を出さず、コラム・野球ノート・タイムライン・DM に特化した画面とする。
  - **使う（ON）**: 試合ごとの個人結果の簡易入力フォームと、通算・試合別の成績表示を有効にする。
- SCOREBASE 連携チーム（`source = 'RECBASE'` の試合データが上がってくるチーム）では、SCOREBASE からの自動集計を主としつつ、スコアを付けなかった練習試合などを簡易入力で補うことも選べる余地を残す。

---

## 2. 入力方式と項目カスタマイズ（Excel風一括入力 ／ 1人ずつ入力 ＋ 使う項目の選択）
打席ごと（1球・1打席ごとの記録）は SCOREBASE（RECBASE）の役割とし、SKILLBASE の簡易入力は **「1試合 × 選手ごとの合計」** を柔軟に入れられる形にする。

### 2つの入力モード（切り替え可能）
1. **📋 チーム一括入力（Excel風テーブル）**:
   - 1試合に対してチームの選手たちが縦に並び、横の列（選んだ項目）に Tab キー等で連続して数字を打ち込めるスプレッドシート形式。
   - 右端にその試合の「打率・OPS・投球回」がリアルタイム自動計算され、入力があった選手だけをまとめて一括登録できる。
2. **👤 1人ずつじっくり入力**:
   - 選手を1人選んで、打撃・走塁・投球の選んだ項目をカード形式で丁寧に入力できるモード。

### 使う項目のカスタマイズ（テンプレート＋個別チェックボックス）
`base-stats`（`batting_game` / `running_game` / `pitching_game`）の集計・分析に絡む **全36項目** を網羅し、その中からチームや試合に応じて使う項目だけをチェックボックスで選べる：
- **⭐ テンプレート1「基本6項目（デフォルト）」**:
  - 打数 (`ab`)・安打 (`hits`)・本塁打 (`hr`)・打点 (`rbi`)・得点 (`runs`)・盗塁 (`sb`)
- **⚾ テンプレート2「打撃・走塁しっかり（17項目）」**:
  - 基本6項目 ＋ 打席 (`pa`)・二塁打 (`doubles`)・三塁打 (`triples`)・四球 (`bb`)・死球 (`hbp`)・三振 (`so`)・犠打 (`sh`)・犠飛 (`sf`)・得点圏打数 (`risp_ab`)・得点圏安打 (`risp_hits`)・盗塁死 (`cs`)
- **📊 テンプレート3「フル項目（打撃14＋走塁9＋投手13＝全36項目）」**:
  - 上記すべて ＋ 走塁詳細（牽制死 `po`・暴投/捕逸進塁 `adv_wp`・余分進塁機会/成功 `xbt_opp`/`xbt_ok`・タッチアップ機会/生還 `tag_opp`/`tag_ok`）＋ 投手全項目（投球回 `pit_innings`・端数 `pit_thirds`・球数 `pitches`・対戦打者 `batters`・被安打 `pit_hits`・被本塁打 `pit_hr`・奪三振 `pit_so`・与四球 `pit_bb`・与死球 `pit_hbp`・失点 `pit_runs`・自責点 `pit_earned`・暴投 `wp`・ボーク `balk`）
- どのテンプレートを選んだ状態からでも、**1項目ずつチェックボックスで自由に足し引き（ON/OFF）**できる。

---

## 3. データの置き場と流れ（案）
```
[SKILLBASE 簡易入力画面]
   ↓ ① SKILLBASE 独自 DB に下書き・入力履歴を保存（必要な場合）
[SKILLBASE サーバー]
   ↓ ② 署名つき通行証（Bearer）で BASE 共通窓口（id.easystance.app）の PUT /api/id/base-games/:gameId を呼ぶ
[BASE 共通の成績データベース (D1: base-stats)]
   ・games（source = 'SKILLBASE_SIMPLE'）
   ・batting_game（試合×選手の合計をそのまま格納。plate_appearances は 0 行）
   ・running_game（試合×選手の合計）
   ・pitching_game（試合×選手の合計）
```

### データの出どころ（`source`）の区別
- `base-stats` の `games` 表に **`source TEXT NOT NULL DEFAULT 'RECBASE' CHECK (source IN ('RECBASE', 'SKILLBASE_SIMPLE'))`** を設ける案：
  - `'RECBASE'`: 打席ごと（`plate_appearances`）の行があり、`batting_game` は打席からサーバーが自動算出。カウント別・打球方向などの詳細 AI 分析の対象になる。
  - `'SKILLBASE_SIMPLE'`: 打席ごとの行（`plate_appearances`）は持たず、受け取った `batting_game` / `running_game` / `pitching_game` の合計行をそのまま保存する。
- **分析側・表示側の扱い**:
  - 通算の打率・出塁率・OPS・防御率・盗塁数（`GET /api/id/base-stats`）は、`batting_game` / `running_game` / `pitching_game` の `SUM` なので、**`RECBASE` と `SKILLBASE_SIMPLE` を同じ表・同じ式でシームレスに合算・表示できる**。
  - 一方、打席ごとのデータが必要な AI 分析（カウント別・初球・打球方向など）は、`source = 'RECBASE'` の試合（`plate_appearances` がある試合）だけを対象とし、画面にも「簡易入力（合計のみ）」の印を出して粒度の違いが分かるようにする。

---

## 4. 書き込み実装の前に決めること（依存関係）
1. **チームの核（`team_id`・チーム名）の BASE 共通化（`BASE_ID_DESIGN 2.7`）**
   - 現在 `base-stats.games.team_id` は HOMEBASE の `Team.id` を前提としている。SKILLBASE 単独チームでも共通の `team_id` を持てるようにする。
2. **窓口（`/api/id/*`）の分離（`NEXT_PREP_DESIGNS ①`）**
   - SKILLBASE は `base-stats` D1 に直接つながず、必ず窓口を通す決まり。窓口が HOMEBASE の `User`・`Team` 前提から BASE 共通アカウント（`base-id`）＋共通チームの核を参照する形になった段階で、書き込み API をつなぐ。
