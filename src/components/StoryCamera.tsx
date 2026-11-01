"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface StoryCameraProps {
  onClose: () => void;
  onRecordComplete: (file: File, thumbnailFile?: File | null) => void;
}

export default function StoryCamera({ onClose, onRecordComplete }: StoryCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [chunks, setChunks] = useState<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const thumbnailBlobRef = useRef<Blob | null>(null);

  // カメラ表示中は背後のページ（タイムライン）がスワイプでスクロールしないようにロックする
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, []);

  // 録画中のプレビュー映像からサムネイル用の静止画を1枚キャプチャする
  // （MediaRecorderのWebMはシーク用メタデータを持たず、<video>だけではサムネイルが出ないため）
  const captureThumbnail = () => {
    try {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      const maxW = 480;
      const scale = Math.min(1, maxW / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) thumbnailBlobRef.current = blob;
      }, "image/jpeg", 0.75);
    } catch (e) {
      console.error("Thumbnail capture failed:", e);
    }
  };

  const startCamera = useCallback(async (mode: "environment" | "user") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: true, // ユーザーの希望により音声をONに戻す（撮影中は一時的に通話中モードになります）
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setErrorMsg("");
    } catch (err: any) {
      console.error("Camera access error:", err);
      setErrorMsg("カメラまたはマイクへのアクセスが拒否されました。ブラウザの設定を確認してください。");
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [facingMode, startCamera]);

  const startRecording = () => {
    if (!streamRef.current) return;
    
    setChunks([]);
    let options: any;
    const isIOS =
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    if (isIOS && MediaRecorder.isTypeSupported("video/mp4")) {
      options = { mimeType: "video/mp4", videoBitsPerSecond: 800000 };
    } else {
      // iOS/Safariとの互換性を確保するため、すべてのブラウザで再生可能な H.264 コーデックを最優先にする
      options = { mimeType: "video/webm;codecs=h264,opus", videoBitsPerSecond: 800000 };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: "video/webm;codecs=h264", videoBitsPerSecond: 800000 };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 800000 };
          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 800000 };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: "video/webm", videoBitsPerSecond: 800000 };
              if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: "video/mp4", videoBitsPerSecond: 800000 };
              }
            }
          }
        }
      }
    }

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          setChunks((prev) => [...prev, event.data]);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      thumbnailBlobRef.current = null;
      // 開始直後の暗転を避けるため少し待ってからキャプチャ
      setTimeout(captureThumbnail, 500);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 39) {
            // 40秒で自動的に録画をストップする
            setTimeout(() => {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                stopRecording();
              }
            }, 0);
            return 40;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("MediaRecorder start error:", err);
      setErrorMsg("録画を開始できませんでした。");
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);

      setTimeout(() => {
        setChunks((prevChunks) => {
          if (prevChunks.length > 0) {
            const mimeType = mediaRecorderRef.current?.mimeType || "video/webm";
            const blob = new Blob(prevChunks, { type: mimeType });
            const ext = mimeType.includes("mp4") ? "mp4" : "webm";
            const fileName = `story_${Date.now()}.${ext}`;
            const file = new File([blob], fileName, { type: mimeType });
            const thumbBlob = thumbnailBlobRef.current;
            const thumbFile = thumbBlob
              ? new File([thumbBlob], `story_${Date.now()}_thumb.jpg`, { type: "image/jpeg" })
              : null;
            onRecordComplete(file, thumbFile);
          }
          return prevChunks;
        });
      }, 300);
    }
  }, [isRecording, onRecordComplete]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // 祖先要素のtransform（.animate-fade-in等）の影響でfixedがズレないよう、body直下にポータルで描画する
  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={{
      position: "fixed",
      top: 0, left: 0, width: "100vw", height: "100dvh",
      backgroundColor: "#000",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      touchAction: "none",
      overscrollBehavior: "none"
    }}>
      <div style={{
        position: "absolute", top: "20px", left: "20px", right: "20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        zIndex: 10
      }}>
        <button type="button" onClick={onClose} style={{
          background: "rgba(0,0,0,0.5)", color: "#fff", border: "none",
          width: "40px", height: "40px", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "20px", cursor: "pointer"
        }}>✕</button>

        {isRecording && (
          <div style={{
            background: "rgba(255, 71, 87, 0.8)", color: "#fff",
            padding: "4px 12px", borderRadius: "20px",
            fontSize: "14px", fontWeight: "bold",
            display: "flex", alignItems: "center", gap: "6px"
          }}>
            <div style={{ width: "8px", height: "8px", background: "#fff", borderRadius: "50%", animation: "pulse 1s infinite" }} />
            {String(Math.floor(recordingTime / 60)).padStart(2, "0")}:{String(recordingTime % 60).padStart(2, "0")}
          </div>
        )}

        <button type="button" onClick={toggleCamera} disabled={isRecording} style={{
          background: "rgba(0,0,0,0.5)", color: "#fff", border: "none",
          width: "40px", height: "40px", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "20px", cursor: isRecording ? "not-allowed" : "pointer",
          opacity: isRecording ? 0.5 : 1
        }}>🔄</button>
      </div>

      {errorMsg && (
        <div style={{
          position: "absolute", top: "80px", left: "20px", right: "20px",
          background: "rgba(255, 71, 87, 0.9)", color: "#fff",
          padding: "12px", borderRadius: "8px", textAlign: "center", zIndex: 10, fontSize: "14px"
        }}>
          {errorMsg}
        </div>
      )}

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: facingMode === "user" ? "scaleX(-1)" : "none"
          }}
        />
      </div>

      <div style={{
        height: "170px", background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        paddingBottom: "max(90px, calc(env(safe-area-inset-bottom, 0px) + 40px))",
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%"
      }}>
        {!isRecording ? (
          <button type="button" onClick={startRecording} style={{
            width: "70px", height: "70px", borderRadius: "50%",
            border: "4px solid #fff", background: "var(--danger)",
            cursor: "pointer", transition: "transform 0.2s"
          }} />
        ) : (
          <button type="button" onClick={stopRecording} style={{
            width: "70px", height: "70px", borderRadius: "50%",
            border: "4px solid #fff", background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer"
          }}>
            <div style={{ width: "30px", height: "30px", background: "var(--danger)", borderRadius: "4px" }} />
          </button>
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
      `}} />
    </div>,
    document.body
  );
}
