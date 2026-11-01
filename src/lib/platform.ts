// iOSネイティブアプリ判定。クライアント専用(SSR時は常にfalse)。
//
// App Store Guideline 3.1.1対応(2026-09-06、iOS再申請リジェクト受けて追加):
// Appleの審査で「アプリ内に、Apple以外の決済手段(会費Pay)につながる登録・料金案内・
// プラン変更の導線がある」と指摘された。このアプリはCapacitorが本番サイトをそのまま
// 読み込む方式(capacitor.config.tsのserver.url参照)のため、Web版の新規登録・料金表・
// プラン変更UIがそのままネイティブアプリ内に出てしまっていたのが原因。
// 対策: 新規チーム作成・料金案内・プラン変更(トライアル開始/終了)といった「外部決済に
// つながる導線」は、この関数でiOSネイティブ実行時のみ非表示にする(Web版・Android版では
// そのまま表示する。Googleは同種の指摘が無く、Androidの登録機能をあえて削る理由が無いため)。
// Netflix/Spotify等と同じ、iOSアプリを「ログイン専用」にするパターン。
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return (window as any).Capacitor?.getPlatform?.() === "ios";
}
