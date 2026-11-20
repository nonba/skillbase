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

## 2. 入力の粒度（試合ごとの個人の合計・細かさは任意）
打席ごと（1球・1打席ごとの記録）は SCOREBASE（RECBASE）の役割とし、SKILLBASE の簡易入力は **「1試合 × 1選手の合計」** を最短30秒で入れられる形にする。

### 試合の基本情報
| 項目 | 必須/任意 | 内容 |
|---|---|---|
| 日付 (`gameDate`) | 必須 | `YYYY-MM-DD` |
| 対戦相手 (`opponentName`) | 必須 | 自由入力（60文字以内） |
| 種別 (`kind`) | 任意 | `OFFICIAL`（公式戦）/ `PRACTICE`（練習試合） |
| 大会名・回戦 (`tournament`, `round`) | 任意 | 例: 秋季大会・準決勝 |
| スコア (`myRuns`, `oppRuns`) | 任意 | 自チーム得点・相手得点 |

### 個人の合計（必要な項目だけ入力・未入力は 0）
1. **打撃（基本項目）**: 打席 (`pa`)・打数 (`ab`)・安打 (`hits`)・本塁打 (`hr`)・打点 (`rbi`)
2. **打撃（詳細・任意折りたたみ）**: 二塁打 (`doubles`)・三塁打 (`triples`)・四球 (`bb`)・死球 (`hbp`)・三振 (`so`)・犠打 (`sh`)・犠飛 (`sf`)・得点圏打数 (`risp_ab`)・得点圏安打 (`risp_hits`)
3. **走塁（任意折りたたみ）**: 得点 (`runs`)・盗塁 (`sb`)・盗塁死 (`cs`)
4. **投球（登板時のみ・任意折りたたみ）**: 投球回（回＋1/3・2/3 → `outs` に換算）・球数 (`pitches`)・被安打 (`hits`)・奪三振 (`so`)・与四死球 (`bb`, `hbp`)・失点 (`runs`)・自責点 (`earned`)

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
