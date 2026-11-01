// 一時デバッグ用: 通話中のクライアント(スマホWebView)側イベントをサーバーに飛ばし、
// `wrangler tail` の [CLIENT-CALL] から追えるようにする。原因特定後に削除する。
export function clog(tag: string, msg?: unknown) {
  let msgStr = "";
  try {
    msgStr = typeof msg === "string" ? msg : msg === undefined ? "" : JSON.stringify(msg);
  } catch {
    msgStr = String(msg);
  }
  try {
    // eslint-disable-next-line no-console
    console.log(`[clog] ${tag}`, msg ?? "");
    fetch("/api/debug/clientlog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, msg: msgStr }),
      keepalive: true, // 画面が閉じる瞬間でも送信を試みる
    }).catch(() => {});
  } catch {
    // ログ送信の失敗が通話処理に影響しないよう完全に握りつぶす
  }
}
