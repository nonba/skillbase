"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getPusherClient, userChannelName } from "@/lib/pusher";
import CallOverlay from "./CallOverlay";
import { clog } from "@/lib/clientCallLog";

// Web Audio APIを用いたサウンド合成ヘルパー
const playMessageSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
    gainNode.gain.setValueAtTime(0.45, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);

    // 短い二音チャイム（ソ -> ド）
    const osc1 = audioCtx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(392.00, audioCtx.currentTime); // G4
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime + 0.12); // C5
    osc1.connect(gainNode);

    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.45);
  } catch (e) {
    console.error("Failed to play message sound:", e);
  }
};

export default function GlobalCallListener() {
  const { data: session } = useSession();
  const [activeCall, setActiveCall] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [incomingCallSignal, setIncomingCallSignal] = useState<any | null>(null);
  // 通知の「応答」ボタンから起動された場合、自動で応答する
  const [autoAnswer, setAutoAnswer] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [opponentId, setOpponentId] = useState<string>("");
  const [opponentName, setOpponentName] = useState<string>("");
  
  // 画面デバッグログ用
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addDebugLog = (msg: string) => {
    const time = new Date().toLocaleTimeString("ja-JP");
    setDebugLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 8)]);
  };

  const ringIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringAudioCtxRef = useRef<AudioContext | null>(null);
  // 直近に拒否/終了した通話(conversationId→時刻)。発信側がこちらの拒否を取りこぼして着信信号を
  // 鳴らし直してきた場合に、着信を再表示せず拒否を返し直して発信側を確実に止めるために使う。
  const handledCallsRef = useRef<Map<string, number>>(new Map());

  // 通話シグナルAPIへ拒否を送る（発信側を止める）
  const sendRejectSignal = (convId: string, targetUserId: string) => {
    try {
      fetch("/api/call/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, type: "reject-call", targetUserId }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* noop */ }
  };

  // ネイティブ(Android)の着信音を止める。応答/拒否時に呼ぶ。Webのみ環境では何もしない。
  const stopNativeRingtone = () => {
    try { (window as any).HomebaseCall?.stopRingtone?.(); } catch { /* noop */ }
  };

  // ── 通知タップからアプリが起動した場合：URLパラメータを検知して着信画面を即表示 ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isIncomingCall = params.get("incomingCall") === "true";
    if (!isIncomingCall) return;

    const callerId = params.get("callerId") || "";
    const callerName = params.get("callerName") || "メンバー";
    const callTypeParam = (params.get("callType") || "audio") as "audio" | "video";
    const isAutoAnswer = params.get("autoAnswer") === "true";
    // URLからconversationIdを取得（例: /dashboard/messages/[id]?...）
    const pathParts = window.location.pathname.split("/");
    const convId = pathParts[pathParts.length - 1] || "";

    if (callerId && convId) {
      addDebugLog(`📲 通知タップから着信復元: ${callerName} (${callTypeParam})`);
      setConversationId(convId);
      setOpponentId(callerId);
      setOpponentName(callerName);
      setCallType(callTypeParam);
      if (isAutoAnswer) setAutoAnswer(true);
      // 着信シグナルとして扱う（isCallerをfalseにして「受信側」として動作させる）
      setIncomingCallSignal({
        senderId: callerId,
        senderName: callerName,
        conversationId: convId,
        type: "incoming-call",
        data: { callType: callTypeParam }
      });
      setActiveCall(true);
      // 通知タップ/全画面着信からの復元時は、ネイティブ側が着信音を鳴らし続けているのでWeb着信音は鳴らさない
      // （応答/拒否でstopRingingSound→stopNativeRingtoneが呼ばれてネイティブ側が止まる）。
      // URLパラメータをクリア（ページリロード時に再表示されないように）
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Android JSブリッジ: MainActivity.handleIncomingCallIntent からページリロードなしで着信を注入 ──
  // webView.loadUrl() でリロードするとセッションが消えて着信画面が出ないため、
  // JS evaluateJavascript 経由でこの関数を直接呼ぶ。
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__homebaseInjectIncomingCall = (params: {
      callerId: string;
      callerName: string;
      callType: "audio" | "video";
      conversationId: string;
      autoAnswer: boolean;
    }) => {
      addDebugLog(`📲 ネイティブJSブリッジから着信注入: ${params.callerName} (${params.callType})`);
      setConversationId(params.conversationId);
      setOpponentId(params.callerId);
      setOpponentName(params.callerName);
      setCallType(params.callType || "audio");
      setAutoAnswer(!!params.autoAnswer);
      setIncomingCallSignal({
        senderId: params.callerId,
        senderName: params.callerName,
        conversationId: params.conversationId,
        type: "incoming-call",
        data: { callType: params.callType || "audio" }
      });
      setActiveCall(true);
      // ネイティブ側がすでに着信音を鳴らしているためWeb側は鳴らさない
    };
    return () => {
      delete (window as any).__homebaseInjectIncomingCall;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringAudioRef = useRef<HTMLAudioElement | null>(null);

  // 着信音（コール音）の開始（実音源 /sounds/ringtone.wav を使用して確実再生）
  const startRingingSound = () => {
    stopRingingSound();

    try {
      if (!ringAudioRef.current) {
        ringAudioRef.current = new Audio(`/sounds/ringtone.wav?v=${Date.now()}`);
        ringAudioRef.current.loop = true;
      }
      const audio = ringAudioRef.current;
      audio.volume = 1.0;
      audio.currentTime = 0;
      audio.play().catch((err) => {
        console.warn("Ringtone HTML5 audio play blocked by browser:", err);
      });
    } catch (e) {
      console.error("Failed to play ringtone file:", e);
    }
  };

  const stopRingingSound = () => {
    if (ringAudioRef.current) {
      try {
        ringAudioRef.current.pause();
        ringAudioRef.current.currentTime = 0;
      } catch { /* noop */ }
      ringAudioRef.current = null;
    }
    // 応答/拒否/終了時はネイティブの着信音も必ず止める（Webとネイティブの二重・混線防止）
    stopNativeRingtone();
  };

  // activeCallがfalseになった瞬間に着信音を強制遮断
  useEffect(() => {
    if (!activeCall) {
      stopRingingSound();
    }
  }, [activeCall]);

  const activeCallRef = useRef(activeCall);
  useEffect(() => {
    activeCallRef.current = activeCall;
    // 通知タップハンドラ（PushNotificationManager）が「着信画面表示中はリロードしない」判定に使う。
    // 着信中に通知もタップすると、ページ全体がリロードされて着信状態が壊れるのを防ぐ。
    (window as any).__homebaseCallActive = activeCall;
  }, [activeCall]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      clog("listener:no-session", {});
      return;
    }
    const pusher = getPusherClient();
    if (!pusher) {
      clog("listener:no-pusher", {});
      addDebugLog("⚠️ Pusherクライアントの初期化に失敗しました。");
      return;
    }

    const channelName = userChannelName(userId);
    clog("listener:subscribe", { user: userId, name: session.user?.name, state: pusher.connection?.state });
    addDebugLog(`📡 Pusherチャンネル購読開始: ${channelName}`);
    const channel = pusher.subscribe(channelName);
    channel.bind("pusher:subscription_succeeded", () => clog("listener:subscribed", { channelName }));
    channel.bind("pusher:subscription_error", (e: any) => clog("listener:sub_error", { status: e?.status }));

    const handleCallSignal = (signal: any) => {
      addDebugLog(`📞 シグナル受信: type=${signal.type}, from=${signal.senderName}`);
      const callKey = signal.data?.callId || signal.conversationId;

      // 着信：既に通話中なら無視
      if (signal.type === "incoming-call") {
        clog("listener:incoming", { conv: signal.conversationId, callId: signal.data?.callId, isRetry: !!signal.data?.isRetry, active: activeCallRef.current });
        if (activeCallRef.current) {
          addDebugLog("⚠️ 既に通話中のため、新規着信を無視しました。");
          return;
        }
        // 直近に拒否/終了した同一通話セッションへの遅延ハートビート再送なら、着信を出さずに拒否を返して発信側を止める。
        // （※通話IDで識別するため、新しい通話発信は5秒未満でも確実に着信画面が表示されます）
        const handledAt = handledCallsRef.current.get(callKey) || (signal.conversationId ? handledCallsRef.current.get(signal.conversationId) : undefined);
        if (signal.data?.isRetry && handledAt && Date.now() - handledAt < 5000) {
          clog("listener:auto-reject", { conv: signal.conversationId, callKey });
          sendRejectSignal(signal.conversationId, signal.senderId);
          return;
        }
        // 新規着信として表示するので、過去の処理済み記録は消す
        if (callKey) handledCallsRef.current.delete(callKey);
        if (signal.conversationId) handledCallsRef.current.delete(signal.conversationId);

        // Pusher経由の着信は必ず手動応答にする。自動応答(autoAnswer)は通知タップ経由のみで、
        // 前の通話の値が残っていると「押してないのに自動応答→即切断」になるため、ここで必ず落とす。
        setAutoAnswer(false);
        setIncomingCallSignal(signal);
        setConversationId(signal.conversationId);
        setOpponentId(signal.senderId);
        setOpponentName(signal.senderName || "不明なユーザー");
        setCallType(signal.data?.callType || "audio");
        setActiveCall(true);
        startRingingSound();
        addDebugLog("➡️ 着信画面を起動しました。");
        return;
      }

      // 相手または自分が通話に応答した場合 → 呼び出し音（ベル）のみ停止し、画面は維持して接続を開始
      if (signal.type === "accept-call") {
        addDebugLog(`🔕 ${signal.type} 受信 → 呼び出し音を止めます（通話開始）`);
        stopRingingSound();
        return;
      }

      // 通話拒否または切断された場合 → 画面を閉じる
      if (signal.type === "reject-call" || signal.type === "hangup") {
        addDebugLog(`🔕 ${signal.type} 受信 → 着信画面を閉じます`);
        // この通話セッションを終了済みとして記録し、直後に届く遅延ハートビートを吸収する
        if (callKey) handledCallsRef.current.set(callKey, Date.now());
        if (signal.conversationId) handledCallsRef.current.set(signal.conversationId, Date.now());
        setActiveCall(false);
        setIncomingCallSignal(null);
        setAutoAnswer(false); // 自動応答フラグを次の着信に持ち越さない
        stopRingingSound();
        return;
      }
    };

    const handleNewMessage = (data: any) => {
      addDebugLog(`✉️ 新着メッセージ受信: from=${data.senderName}`);
      const path = window.location.pathname;
      const currentChatPath = `/dashboard/messages/${data.conversationId}`;
      if (path !== currentChatPath) {
        playMessageSound();
        addDebugLog("🔊 通知音を再生しました。");
      } else {
        addDebugLog("ℹ️ チャット画面内のため通知音はスキップされました。");
      }
    };

    channel.bind("call-signal", handleCallSignal);
    channel.bind("new-message", handleNewMessage);

    pusher.connection.bind('state_change', (states: any) => {
      addDebugLog(`⚡ Pusher接続ステータス変化: ${states.previous} ➡️ ${states.current}`);
    });

    return () => {
      channel.unbind("call-signal", handleCallSignal);
      channel.unbind("new-message", handleNewMessage);
      pusher.unsubscribe(channelName);
      stopRingingSound();
    };
  }, [session?.user?.id]);

  // アプリへの復帰（バックグラウンド→フォアグラウンド / 画面フォーカス）時に
  // Pusherの接続状態をチェックし、切断されていれば自動再接続（ヒーリング）する
  useEffect(() => {
    const handleCheckPusher = () => {
      const pusher = getPusherClient();
      if (pusher && pusher.connection?.state !== "connected" && pusher.connection?.state !== "connecting") {
        clog("listener:reconnect-check", { state: pusher.connection?.state });
        addDebugLog(`🔄 Pusher再接続を実行中 (現在: ${pusher.connection?.state})`);
        pusher.connect();
      }
    };

    window.addEventListener("focus", handleCheckPusher);
    document.addEventListener("visibilitychange", handleCheckPusher);
    return () => {
      window.removeEventListener("focus", handleCheckPusher);
      document.removeEventListener("visibilitychange", handleCheckPusher);
    };
  }, []);

  useEffect(() => {
    if (!activeCall) {
      stopRingingSound();
    }
  }, [activeCall]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <>
      {/* デバッグコンソール：開発環境のみ表示 */}
      {isDev && (
        <div style={{
          position: "fixed",
          top: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0, 0, 0, 0.85)",
          color: "#00ffcc",
          padding: "10px 16px",
          borderRadius: "8px",
          fontSize: "11px",
          fontFamily: "monospace",
          zIndex: 99999,
          maxWidth: "90%",
          width: "360px",
          pointerEvents: "none",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          border: "1px solid #00ffcc"
        }}>
          <div style={{ fontWeight: "bold", borderBottom: "1px solid #00ffcc", paddingBottom: "4px", marginBottom: "4px" }}>
            📡 SKILLBASE REALTIME DEBUGGER
          </div>
          {debugLogs.length === 0 ? (
            <div style={{ color: "#aaa" }}>ログなし (操作を待機中)</div>
          ) : (
            debugLogs.map((log, idx) => (
              <div key={idx} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{log}</div>
            ))
          )}
        </div>
      )}

      {activeCall && session?.user && (
        <CallOverlay
          conversationId={conversationId}
          currentUserId={session?.user?.id || ""}
          currentUserName={session?.user?.name || "自分"}
          opponentId={opponentId}
          opponentName={opponentName}
          incomingSignal={incomingCallSignal}
          initialCallType={callType}
          autoAccept={autoAnswer}
          onAccepted={stopRingingSound}
          onClose={() => {
            // この通話を終了済みとして記録（拒否/終了の直後に届く着信ハートビートを吸収し、
            // 発信側にはsendRejectSignalで拒否を返して確実に止める）
            if (conversationId) handledCallsRef.current.set(conversationId, Date.now());
            setActiveCall(false);
            setIncomingCallSignal(null);
            setAutoAnswer(false);
            stopRingingSound();
            addDebugLog("⏹️ 通話を終了しました。");
          }}
        />
      )}
    </>
  );
}
