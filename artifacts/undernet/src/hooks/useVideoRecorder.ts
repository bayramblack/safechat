import { useCallback, useEffect, useRef, useState } from "react";
import { stopRecorder, stopStream } from "@/lib/media-cleanup";

interface UseVideoRecorderOptions {
  onComplete: (file: File, durationSec: number) => void;
}

function getVideoMimeType(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: "", ext: "webm" };
  const candidates = [
    { mimeType: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
    { mimeType: "video/mp4", ext: "mp4" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", ext: "webm" };
}

export function useVideoRecorder({ onComplete }: UseVideoRecorderOptions) {
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isSwitching, setIsSwitching] = useState(false);
  const previewBlobRef = useRef<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const extRef = useRef("webm");
  const mimeRef = useRef("video/webm");
  const durationRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  const fullCleanup = useCallback(() => {
    stopTimer();
    if (recorderRef.current) {
      stopRecorder(recorderRef.current);
      recorderRef.current = null;
    }
    releaseStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewBlobRef.current = null;
    setIsCaptureOpen(false);
    setIsRecording(false);
    setSeconds(0);
    setPreviewUrl(null);
    durationRef.current = 0;
  }, [previewUrl, releaseStream, stopTimer]);

  const open = useCallback(
    async (mode: "user" | "environment" = "user") => {
      try {
        releaseStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: true,
        });
        streamRef.current = stream;
        setFacingMode(mode);
        setIsCaptureOpen(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        }, 100);
      } catch {
        // permission denied or no device
      }
    },
    [releaseStream],
  );

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    const { mimeType, ext } = getVideoMimeType();
    const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(streamRef.current, opts);
    const actualMime = recorder.mimeType || mimeType || "video/webm";
    extRef.current = ext;
    mimeRef.current = actualMime;
    chunksRef.current = [];
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        previewBlobRef.current = blob;
      }
      setIsRecording(false);
      stopTimer();
      recorderRef.current = null;
    };
    recorder.start();
    setIsRecording(true);
    setSeconds(0);
    durationRef.current = 0;
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setSeconds((t) => {
        if (t >= 29) {
          // Stop at 30s
          if (recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.stop();
          }
          releaseStream();
          return 30;
        }
        return t + 1;
      });
    }, 1000);
  }, [releaseStream, stopTimer]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    releaseStream();
  }, [releaseStream]);

  const cancel = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.onstop = () => {
        recorderRef.current = null;
      };
      stopRecorder(recorderRef.current);
    }
    fullCleanup();
  }, [fullCleanup]);

  const switchCamera = useCallback(async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    const newMode = facingMode === "user" ? "environment" : "user";
    const wasRecording =
      isRecording && recorderRef.current && recorderRef.current.state === "recording";
    if (wasRecording && recorderRef.current) {
      recorderRef.current.onstop = () => {};
      recorderRef.current.stop();
    }
    releaseStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode },
        audio: true,
      });
      streamRef.current = stream;
      setFacingMode(newMode);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      if (wasRecording) {
        const { mimeType, ext } = getVideoMimeType();
        const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
        const recorder = new MediaRecorder(stream, opts);
        extRef.current = ext;
        mimeRef.current = recorder.mimeType || mimeType || "video/webm";
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeRef.current });
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            previewBlobRef.current = blob;
          }
          setIsRecording(false);
          stopTimer();
          recorderRef.current = null;
        };
        recorderRef.current = recorder;
        recorder.start();
      }
    } catch {
      if (wasRecording) {
        setIsRecording(false);
        stopTimer();
      }
    } finally {
      setIsSwitching(false);
    }
  }, [facingMode, isRecording, isSwitching, releaseStream, stopTimer]);

  const sendCaptured = useCallback(() => {
    const blob = previewBlobRef.current;
    if (!blob) return;
    const duration = durationRef.current || seconds || 1;
    const file = new globalThis.File([blob], `video-${Date.now()}.${extRef.current}`, {
      type: mimeRef.current,
    });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    releaseStream();
    setIsCaptureOpen(false);
    setPreviewUrl(null);
    previewBlobRef.current = null;
    setSeconds(0);
    durationRef.current = 0;
    onComplete(file, duration);
  }, [onComplete, previewUrl, releaseStream, seconds]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopRecorder(recorderRef.current);
      recorderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isCaptureOpen,
    isRecording,
    seconds,
    previewUrl,
    facingMode,
    isSwitching,
    videoRef,
    open,
    startRecording,
    stopRecording,
    cancel,
    switchCamera,
    sendCaptured,
  };
}
