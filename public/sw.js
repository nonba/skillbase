self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

// Chromeなどでは fetch ハンドラが必要（PWAの判定に使われることがある）
self.addEventListener("fetch", function () {
  // 通常のネットワークリクエストを通す（キャッシュなし）
});

self.addEventListener("push", function (event) {
  let title = "SKILLBASEからの通知";
  let body = "新しい通知があります";
  let url = "/dashboard";

  let isCall = false;

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || body;
      url = data.url || url;
      // 明示的なtype="call"フラグで判定
      if (data.type === "call") {
        isCall = true;
      }
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  // フォールバックとして、本文の文字による判定も残す
  if (!isCall) {
    isCall =
      body.includes("通話") ||
      body.includes("ビデオ") ||
      title.includes("通話") ||
      title.includes("ビデオ");
  }

  const options = {
    body: body,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    vibrate: isCall
      ? [500, 150, 500, 150, 500, 150, 500, 150, 500]
      : [200, 100, 200],
    data: {
      url: url,
    },
    tag: isCall ? "strike-call-notification" : "strike-msg-notification",
    renotify: true,
    requireInteraction: isCall,
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch(function (err) {
      console.error("showNotification failed with options, retrying minimal:", err);
      return self.registration.showNotification(title, {
        body: body,
        icon: "/icon-192x192.png",
        data: { url: url },
      });
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.includes(self.location.origin)) {
            return client.focus().then(function (c) {
              return c.navigate(targetUrl);
            });
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
