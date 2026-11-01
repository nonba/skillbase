"use client";

import { useEffect, useRef, useState } from "react";
import { getPusherClient, userChannelName } from "@/lib/pusher";
import { clog } from "@/lib/clientCallLog";

// /api/call/ice-servers が使えない場合の最終フォールバック
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

interface CallOverlayProps {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  opponentId: string;
  opponentName: string;
  onClose: () => void;
  incomingSignal?: any; // 着信から起動した場合のシグナル情報
  initialCallType?: "audio" | "video"; // 自ら発信する場合の通話タイプ
  onAccepted?: () => void; // 自分が応答した瞬間に呼ばれる（親側の着信音停止用）
  autoAccept?: boolean; // 通知の「応答」ボタンから起動した場合、自動で応答する
}

export default function CallOverlay({
  conversationId,
  currentUserId,
  currentUserName,
  opponentId,
  opponentName,
  onClose,
  incomingSignal,
  initialCallType = "audio",
  onAccepted,
  autoAccept = false,
}: CallOverlayProps) {
  const [callState, setCallState] = useState<"calling" | "ringing" | "connected" | "disconnected">("calling");
  const [callType, setCallType] = useState<"audio" | "video">(initialCallType);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [callDuration, setCallDuration] = useState(0);

  // WebRTCのメディア接続が実際に確立したか（callState="connected"はシグナル上の応答済みを示すだけ）
  const [rtcConnected, setRtcConnected] = useState(false);

  // 通話経過時間の自動カウントアップ（通話中）
  useEffect(() => {
    if (!rtcConnected) {
      setCallDuration(0);
      return;
    }
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [rtcConnected]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // リモート音声専用の<audio>要素。映像は<video>で表示するが、音声はこのaudio要素から必ず鳴らす。
  // （モバイルWebViewではvideo要素だと音声が出ないことがあるため。特にビデオ通話で無音になる対策）
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pusherSubscribedRef = useRef<boolean>(false);
  const initializedRef = useRef<boolean>(false);

  // setTimeoutやPusherハンドラ内から常に最新の状態を参照するためのref
  // （stateを直接参照すると、クロージャに古い値が残り「応答済みなのに未応答タイムアウトが発火する」バグになる）
  const callStateRef = useRef(callState);
  useEffect(() => { callStateRef.current = callState; }, [callState]);
  const callTypeRef = useRef(callType);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);

  // 発信側の未応答タイムアウト
  const dialTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 発信側の着信ハートビート: モバイルのPusherは一瞬切れることがあり、1回きりの着信信号だと
  // その瞬間に相手が切断中だと永久に届かない。相手が出る/切るまで数秒ごとに鳴らし直して確実に届ける。
  const ringHeartbeatRef = useRef<NodeJS.Timeout | null>(null);
  // 受信側: accept-call のリトライ（通知タップ直後などPusher再接続前に応答した場合、
  // 一度きりの送信では相手からのオファーを受け損ねることがあるため、オファーが届くまで数回再送する）
  const acceptRetryRef = useRef<NodeJS.Timeout | null>(null);
  // 受信した相手側ストリーム（video要素マウント前に届いた場合の再アタッチ用）
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const clearAcceptRetry = () => {
    if (acceptRetryRef.current) {
      clearInterval(acceptRetryRef.current);
      acceptRetryRef.current = null;
    }
  };

  // この画面が発信側か（着信シグナルが無ければ発信側）
  const isCaller = !incomingSignal;

  // 発信側の呼び出し音（プルルル）。実音源ファイル /sounds/ringback.wav を使用して確実再生
  const ringbackAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const stopRingback = () => {
      if (ringbackAudioRef.current) {
        try {
          ringbackAudioRef.current.pause();
          ringbackAudioRef.current.currentTime = 0;
        } catch { /* noop */ }
        ringbackAudioRef.current = null;
      }
    };

    if (isCaller && !rtcConnected && (callState === "calling" || callState === "ringing")) {
      try {
        if (!ringbackAudioRef.current) {
          ringbackAudioRef.current = new Audio(`/sounds/ringback.wav?v=${Date.now()}`);
          ringbackAudioRef.current.loop = true;
        }
        const audio = ringbackAudioRef.current;
        audio.volume = 1.0;
        audio.play().catch((err) => {
          console.warn("Ringback HTML5 audio play blocked by browser:", err);
        });
      } catch (e) {
        console.error("Failed to play ringback file:", e);
      }
    } else {
      stopRingback();
    }

    return () => {
      stopRingback();
    };
  }, [isCaller, rtcConnected, callState]);

  // 着信画面のまま経過した場合の保険（相手のhangup信号が届かなかった場合のゾンビ着信防止）。
  // 「出るまで/切れるまで鳴らす」方針のため長め(2分)に設定。基本は手動操作で終わる。
  useEffect(() => {
    if (callState !== "ringing") return;
    const timer = setTimeout(() => {
      if (callStateRef.current === "ringing") {
        sendSignal("reject-call");
        stopMedia();
        onClose();
      }
    }, 120000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  // WebRTCメディア接続のタイムアップ監視（stuck対策）
  useEffect(() => {
    if (callState === "connected" && !rtcConnected) {
      const timer = setTimeout(() => {
        if (callStateRef.current === "connected" && !rtcConnected) {
          clog("webrtc:timeout", { isCaller });
          alert("通話の接続に失敗しました。電波状況の良い場所でおかけ直しいただくか、接続環境を確認してください。");
          handleHangup();
        }
      }, 20000); // 20秒
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, rtcConnected]);

  // TURN認証情報の取得（マウント時に開始し、PeerConnection作成時にawaitする）
  // モバイル回線同士などSTUNだけでは直接つなげないケースをTURN中継で救う
  const iceServersPromiseRef = useRef<Promise<RTCIceServer[]> | null>(null);
  useEffect(() => {
    iceServersPromiseRef.current = fetch("/api/call/ice-servers")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((data) => {
        console.log(`[Call] ICE servers loaded (TURN: ${data.turn ? "有効" : "無効(STUNのみ)"})`);
        return Array.isArray(data.iceServers) && data.iceServers.length > 0 ? data.iceServers : FALLBACK_ICE_SERVERS;
      })
      .catch((e) => {
        console.error("Failed to fetch ICE servers, using STUN fallback:", e);
        return FALLBACK_ICE_SERVERS;
      });
  }, []);

  const getIceServers = async (): Promise<RTCIceServer[]> => {
    return (await iceServersPromiseRef.current) || FALLBACK_ICE_SERVERS;
  };

  // <video>要素は connected 後に初めてマウントされるため、
  // レンダリング後にローカル/リモートのストリームを必ずアタッチし直す
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current && !localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current && !remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current && remoteStreamRef.current && !remoteAudioRef.current.srcObject) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [callState, callType, isCameraOff, rtcConnected]);
  // 自分のPeerConnection準備前に届いたオファー/ICE候補の待避キュー
  const pendingOfferRef = useRef<any | null>(null);
  const pendingCandidatesRef = useRef<any[]>([]);

  // この通話セッション固有のID（連続発信・テスト時の誤拒否防止用）
  const callIdRef = useRef<string>(
    incomingSignal?.data?.callId || `${conversationId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  );

  // シグナリングAPI送信関数
  const sendSignal = async (type: string, data?: any) => {
    try {
      const payloadData =
        typeof data === "object" && data !== null
          ? { callId: callIdRef.current, ...data }
          : { callId: callIdRef.current, payload: data };

      await fetch("/api/call/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          type,
          targetUserId: opponentId,
          data: payloadData,
        }),
      });
    } catch (e) {
      console.error("Failed to send call signal:", e);
    }
  };

  // メディアストリームのクリーンアップ
  const stopMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    setCallState("disconnected");
  };

  // ローカルメディア（カメラ・マイク）の開始（エコー・ノイズ除去・自動ゲイン高音質チューニング）
  const startLocalStream = async (typeToUse: "audio" | "video", cameraFacing: "user" | "environment" = facingMode) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: typeToUse === "video"
          ? {
              facingMode: cameraFacing,
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 24, max: 30 },
            }
          : false,
      };
      clog("getUserMedia:try", { type: typeToUse, facingMode: cameraFacing, isCaller });
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      clog("getUserMedia:ok", { tracks: stream.getTracks().map((t) => t.kind) });

      if (localVideoRef.current && typeToUse === "video") {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err: any) {
      console.error("Failed to get media devices:", err);
      clog("getUserMedia:FAIL", { name: err?.name, message: err?.message, isCaller });
      alert("カメラまたはマイクの権限を許可してください。");
      handleHangup();
      return null;
    }
  };

  // フロントカメラ（インカメラ） ⇄ リアカメラのリアルタイム切り替え
  const switchCameraFacing = async () => {
    if (callType !== "video" || !localStreamRef.current || !pcRef.current) return;
    const newFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(newFacing);

    try {
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) oldVideoTrack.stop();

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacing,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24, max: 30 },
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        if (oldVideoTrack) localStreamRef.current.removeTrack(oldVideoTrack);
        localStreamRef.current.addTrack(newVideoTrack);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }

        // WebRTCのPeerConnection送信トラックをシームレス差替
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.error("Failed to switch camera facing:", err);
    }
  };

  // WebRTCコネクションの初期化
  const initPeerConnection = (stream: MediaStream, iceServers: RTCIceServer[]) => {
    const pc = new RTCPeerConnection({ iceServers });

    // ローカルのトラックを追加
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // 相手のトラック受信時の処理（event.streams[0]が空の場合も新MediaStreamで補完し無音を100%防止）
    pc.ontrack = (event) => {
      let stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      clog("pc:ontrack", { kind: event.track?.kind, trackId: event.track?.id, callType: callTypeRef.current });

      remoteStreamRef.current = stream;

      // ビデオトラックなら<video>へ割り当て
      if (event.track.kind === "video" && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(() => {});
      }

      // 音声トラック・音声通話時は専用<audio>へ割り当てて大音量強制再生
      if (remoteAudioRef.current) {
        const a = remoteAudioRef.current;
        a.srcObject = stream;
        a.muted = false;
        a.volume = 1.0;
        const tryPlay = (n: number) => {
          a.play()
            .then(() => clog("remoteAudio:play:ok", { kind: event.track?.kind }))
            .catch((e) => {
              clog("remoteAudio:play:retry", { name: e?.name, n });
              if (n < 5) setTimeout(() => tryPlay(n + 1), 300);
            });
        };
        tryPlay(0);
      }
    };

    // ICE Candidate生成時の処理
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal("ice-candidate", event.candidate);
      }
    };

    // メディア接続の状態監視: つながるまでは「接続中...」表示、失敗したら明示して切断する
    // （以前は失敗しても「通話中」のまま無音・真っ暗で、何が起きたか分からなかった）
    pc.onconnectionstatechange = () => {
      console.log("[Call] connection state:", pc.connectionState);
      clog("pc:connectionState", { state: pc.connectionState, isCaller });
      if (pc.connectionState === "connected") {
        setRtcConnected(true);
      } else if (pc.connectionState === "disconnected") {
        console.warn("[Call] 一時的なネットワーク遮断を検知（自動リカバリ中...）");
      } else if (pc.connectionState === "failed") {
        alert("通話接続が切断されました。電波環境を確認のうえ、もう一度おかけ直しください。");
        handleHangup();
      }
    };

    pcRef.current = pc;
    return pc;
  };

  // 通話発信処理（自分が発信者の場合）
  const handleStartCall = async () => {
    clog("caller:startCall", { callType, opponentId });
    setCallState("calling");
    // 相手を呼ぶ
    await sendSignal("incoming-call", { callType });

    // 応答タイムアウト（保険）。「出るまで/切れるまで鳴らす」方針のため2分に延長。
    // 基本は相手が出るか、発信者が自分で切るまで呼び出し音が鳴り続ける。
    dialTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === "calling") {
        alert("相手が応答しませんでした。");
        handleHangup();
      }
    }, 120000);

    // 着信ハートビート: 呼び出し中の間、3秒ごとに着信信号を再送する。
    // isRetry付きなので、サーバー側はこの再送ではプッシュ通知(FCM/WebPush)を重複送信しない。
    ringHeartbeatRef.current = setInterval(() => {
      if (callStateRef.current === "calling") {
        clog("caller:heartbeat");
        sendSignal("incoming-call", { callType: callTypeRef.current, isRetry: true });
      }
    }, 3000);
  };

  const clearDialTimeout = () => {
    if (dialTimeoutRef.current) {
      clearTimeout(dialTimeoutRef.current);
      dialTimeoutRef.current = null;
    }
    // 呼び出し終了時(応答/拒否/切断)はハートビートも必ず止める
    if (ringHeartbeatRef.current) {
      clearInterval(ringHeartbeatRef.current);
      ringHeartbeatRef.current = null;
    }
  };

  // 待避しておいたICE候補をremoteDescription設定後にまとめて適用する
  const flushPendingCandidates = async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Error adding queued ice candidate:", e);
      }
    }
  };

  // 受信したオファーに応答（answer）する
  const answerOffer = async (offerData: any) => {
    const pc = pcRef.current;
    if (!pc) return;
    // オファーが届いた＝シグナル経路は生きているので、accept-callの再送は不要になる
    clearAcceptRetry();
    if (pc.remoteDescription) return; // 再送オファーの二重適用を防ぐ
    await pc.setRemoteDescription(new RTCSessionDescription(offerData));
    await flushPendingCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal("call-answer", answer);
  };

  // 通話応答処理（自分が受信者の場合）
  const handleAccept = async () => {
    clog("callee:accept:tap", { callType: callTypeRef.current, autoAccept });
    // 先に親側の着信音を止める（accept-call信号は相手にしか届かないため、
    // 自分の着信音はここで明示的に止めないと通話中も鳴り続けてしまう）
    onAccepted?.();

    // 先にカメラ/マイクとPeerConnectionを準備してから accept-call を送る。
    // 逆順だと、相手からのオファーがPeerConnection作成前に届いて取りこぼし、
    // 「応答したのに映像/音声が繋がらないまま終わる」状態になる。
    const stream = await startLocalStream(callTypeRef.current);
    if (!stream) return;
    const iceServers = await getIceServers();
    initPeerConnection(stream, iceServers);

    setCallState("connected");
    clog("callee:accept:sent");
    await sendSignal("accept-call");

    // 万一すでにオファーが届いていた場合はここで処理する
    if (pendingOfferRef.current) {
      const queuedOffer = pendingOfferRef.current;
      pendingOfferRef.current = null;
      await answerOffer(queuedOffer);
    }

    // オファーがまだ届いていなければ、届くまでaccept-callを数回再送する
    // （通知タップからの復帰直後はPusherの購読が間に合わず、最初の1通が落ちることがある）
    if (!pcRef.current?.remoteDescription) {
      let attempts = 0;
      clearAcceptRetry();
      acceptRetryRef.current = setInterval(() => {
        attempts++;
        if (attempts > 4 || pcRef.current?.remoteDescription || callStateRef.current === "disconnected") {
          clearAcceptRetry();
          return;
        }
        console.log(`[Call] accept-call再送 (${attempts}回目)`);
        sendSignal("accept-call");
      }, 4000);
    }
  };

  // 通知の「応答」ボタンから起動した場合、自動で応答する（初期化を少し待ってから1回だけ）
  const autoAcceptedRef = useRef(false);
  useEffect(() => {
    if (!autoAccept || !incomingSignal || autoAcceptedRef.current) return;
    autoAcceptedRef.current = true;
    const t = setTimeout(() => {
      handleAccept().catch((e) => console.error("auto-accept failed:", e));
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAccept, incomingSignal]);

  // 通話拒否処理
  const handleReject = async () => {
    clog("callee:reject:tap");
    await sendSignal("reject-call");
    handleHangup();
  };

  // 切断・終了処理
  const handleHangup = async () => {
    clog("hangup", { isCaller, callState: callStateRef.current });
    clearDialTimeout();
    clearAcceptRetry();
    await sendSignal("hangup");
    stopMedia();
    onClose();
  };

  // Pusherのシグナリング受信イベントハンドリング
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (incomingSignal) {
        // 着信からの起動
        setCallState("ringing");
        setCallType(incomingSignal.data?.callType || "audio");
      } else {
        // 発信からの起動
        handleStartCall();
      }
    }

    const pusher = getPusherClient();
    if (!pusher || !currentUserId) {
      clog("pusher:MISSING", { hasPusher: !!pusher, currentUserId });
      return;
    }

    clog("pusher:state", { state: pusher.connection?.state, isCaller });
    pusher.connection?.bind("state_change", (states: any) => {
      clog("pusher:state_change", states);
    });

    const channelName = userChannelName(currentUserId);
    const channel = pusher.subscribe(channelName);
    pusherSubscribedRef.current = true;
    channel.bind("pusher:subscription_succeeded", () => clog("pusher:subscribed", { channelName }));
    channel.bind("pusher:subscription_error", (e: any) => clog("pusher:sub_error", { channelName, status: e?.status }));

    const handleCallSignal = async (signal: any) => {
      clog("recv", { type: signal?.type, match: signal?.conversationId === conversationId, isCaller });
      if (signal.conversationId !== conversationId) return;

      switch (signal.type) {
        case "accept-call": {
          // 相手が電話をとった → 未応答タイムアウトを解除して接続開始
          clearDialTimeout();

          // 受信側がaccept-callを再送してきた場合（1通目のオファーが届かなかった可能性）は、
          // 接続を作り直さず既存のオファーを再送するだけにする。
          // ここで新しいPeerConnectionを作ってしまうと確立中の接続が壊れる。
          if (pcRef.current) {
            if (pcRef.current.localDescription) {
              console.log("[Call] accept-call再受信 → オファーを再送");
              await sendSignal("call-offer", pcRef.current.localDescription);
            }
            break;
          }

          setCallState("connected");
          const stream = await startLocalStream(callTypeRef.current);
          if (!stream) return;

          const iceServers = await getIceServers();
          const pc = initPeerConnection(stream, iceServers);

          // 発信側から Offer を作成して送信
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal("call-offer", offer);
          break;
        }

        case "reject-call":
          clearDialTimeout();
          clearAcceptRetry();
          alert("相手が通話を拒否しました。");
          stopMedia();
          onClose();
          break;

        case "hangup":
          clearDialTimeout();
          clearAcceptRetry();
          stopMedia();
          onClose();
          break;

        case "call-offer":
          if (pcRef.current) {
            await answerOffer(signal.data);
          } else {
            // PeerConnection準備前に届いた場合は待避して、応答処理側で消化する
            pendingOfferRef.current = signal.data;
          }
          break;

        case "call-answer":
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.data));
            await flushPendingCandidates();
          }
          break;

        case "ice-candidate":
          if (signal.data) {
            if (pcRef.current && pcRef.current.remoteDescription) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.data));
              } catch (e) {
                console.error("Error adding ice candidate:", e);
              }
            } else {
              // remoteDescription設定前に届いた候補は捨てずに待避する（捨てると接続確立に失敗する）
              pendingCandidatesRef.current.push(signal.data);
            }
          }
          break;

        default:
          break;
      }
    };

    channel.bind("call-signal", handleCallSignal);

    return () => {
      if (pusherSubscribedRef.current) {
        channel.unbind("call-signal", handleCallSignal);
      }
      clearDialTimeout();
      clearAcceptRetry();
      stopMedia();
    };
  }, [conversationId, currentUserId]);

  // マイク・カメラの切り替え制御
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(10, 15, 30, 0.95)",
      backdropFilter: "blur(20px)",
      zIndex: 2000,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "60px 24px",
      color: "#fff",
      fontFamily: "Inter, system-ui, sans-serif"
    }}>
      {/* 上部：ステータスヘッダー */}
      <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "800", marginBottom: "8px", color: "var(--primary)" }}>
          {opponentName}
        </h2>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", letterSpacing: "1px" }}>
          {callState === "calling" && "呼び出し中..."}
          {callState === "ringing" && `${callType === "video" ? "ビデオ通話" : "音声通話"}の着信中...`}
          {callState === "connected" && (rtcConnected ? `通話中 (${formatDuration(callDuration)})` : "接続中...")}
          {callState === "disconnected" && "切断中..."}
        </p>
      </div>

      {/* 中部：アバターまたはビデオ映像（画面の残り全体を使う） */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: "560px",
        flex: 1,
        minHeight: "240px",
        margin: "20px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "24px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
      }}>
        {/* リモート音声専用のaudio要素（常設・非表示）。映像の有無に関わらず音声はここから鳴らす。 */}
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

        {/* ビデオ通話時の映像領域 */}
        {callType === "video" && callState === "connected" ? (
          <>
            {/* 相手の映像 (全画面)。音声はaudio要素から鳴らすので、ここはmutedにして二重再生を防ぐ */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "24px"
              }}
            />
            {/* 自分の映像 (右上に小さくフロート) */}
            {!isCameraOff && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  width: "120px",
                  height: "90px",
                  objectFit: "cover",
                  borderRadius: "12px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  boxShadow: "0 10px 20px rgba(0,0,0,0.3)",
                  transform: facingMode === "user" ? "scaleX(-1)" : "none"
                }}
              />
            )}
          </>
        ) : (
          /* 音声通話または未接続時のアバター表示 */
          <div style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}>
            {/* 音声通話の相手音声は常設の<audio ref={remoteAudioRef}>から鳴らすため、ここに要素は不要 */}
            {/* 脈動するリングアニメーション (発信・着信中) */}
            {(callState === "calling" || callState === "ringing") && (
              <div className="pulse-ring" style={{
                position: "absolute",
                width: "140px",
                height: "140px",
                borderRadius: "50%",
                border: "2px solid var(--primary)",
                animation: "pulse 1.8s infinite ease-in-out"
              }} />
            )}
            <div style={{
              width: "100px",
              height: "100px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--primary), #ff8c00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "36px",
              fontWeight: "bold",
              boxShadow: "0 10px 30px rgba(255, 71, 87, 0.4)"
            }}>
              {opponentName.charAt(0)}
            </div>
          </div>
        )}
      </div>

      {/* 下部：操作ボタンエリア（各ボタンの下に日本語ラベルを表示） */}
      <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
        {callState === "ringing" ? (
          /* 着信中の応答/拒否ボタン */
          <>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <button
                onClick={handleReject}
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "var(--danger)",
                  border: "none",
                  color: "#fff",
                  fontSize: "24px",
                  cursor: "pointer",
                  boxShadow: "0 8px 24px rgba(255, 71, 87, 0.4)",
                  transform: "rotate(135deg)",
                  transition: "all 0.2s"
                }}
                title="拒否"
              >
                📞
              </button>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>拒否</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <button
                onClick={handleAccept}
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                  background: "#2ecc71",
                  border: "none",
                  color: "#fff",
                  fontSize: "28px",
                  cursor: "pointer",
                  boxShadow: "0 8px 24px rgba(46, 204, 113, 0.4)",
                  transition: "all 0.2s"
                }}
                title="応答"
              >
                📞
              </button>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>応答</span>
            </div>
          </>
        ) : (
          /* 通話中または発信中の制御ボタン */
          <>
            {/* マイクミュート */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <button
                onClick={toggleMute}
                disabled={callState !== "connected"}
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: isMuted ? "var(--primary)" : "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontSize: "20px",
                  cursor: callState === "connected" ? "pointer" : "not-allowed",
                  opacity: callState === "connected" ? 1 : 0.5,
                  transition: "all 0.2s"
                }}
                title={isMuted ? "マイクON" : "マイクミュート"}
              >
                {isMuted ? "🎤" : "🎙️"}
              </button>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                {isMuted ? "ミュート中" : "ミュート"}
              </span>
            </div>

            {/* 切断ボタン */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <button
                onClick={handleHangup}
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                  background: "var(--danger)",
                  border: "none",
                  color: "#fff",
                  fontSize: "28px",
                  cursor: "pointer",
                  boxShadow: "0 10px 30px rgba(255, 71, 87, 0.5)",
                  transform: "rotate(135deg)",
                  transition: "all 0.2s"
                }}
                title="切断"
              >
                📞
              </button>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>終了</span>
            </div>

            {/* カメラ切り替え (ビデオ通話のみ) */}
            {callType === "video" && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={toggleCamera}
                    disabled={callState !== "connected"}
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: isCameraOff ? "var(--primary)" : "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                      fontSize: "20px",
                      cursor: callState === "connected" ? "pointer" : "not-allowed",
                      opacity: callState === "connected" ? 1 : 0.5,
                      transition: "all 0.2s"
                    }}
                    title={isCameraOff ? "カメラON" : "カメラOFF"}
                  >
                    📹
                  </button>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                    {isCameraOff ? "カメラOFF中" : "カメラOFF"}
                  </span>
                </div>

                {!isCameraOff && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <button
                      onClick={switchCameraFacing}
                      disabled={callState !== "connected"}
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                        fontSize: "20px",
                        cursor: callState === "connected" ? "pointer" : "not-allowed",
                        opacity: callState === "connected" ? 1 : 0.5,
                        transition: "all 0.2s"
                      }}
                      title="イン/アウトカメラ切替"
                    >
                      🔄
                    </button>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                      {facingMode === "user" ? "自撮り" : "背合"}
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* 脈動アニメーションスタイル */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}} />
    </div>
  );
}
