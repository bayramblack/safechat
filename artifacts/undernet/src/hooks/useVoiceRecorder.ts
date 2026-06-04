import { useCallback, useEffect, useRef, useState } from "react";
import { stopRecorder, stopStream } from "@/lib/media-cleanup";

interface UseVoiceRecorderOptions {
  onComplete: (file: File, durationSec: number) => void;
}

function getAudioMimeType(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: "", ext: "webm" };
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/webm", ext: "webm" },
    { mimeType: "audio/mp4", ext: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
    { mimeType: "audio/ogg", ext: "ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", ext: "webm" };
}

export function useVoiceRecorder({ onComplete }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setIsRecording(false);
    setSeconds(0);
    durationRef.current = 0;
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mimeType, ext } = getAudioMimeType();
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      const actualMime = recorder.mimeType || mimeType || "audio/webm";
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopStream(streamRef.current);
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: actualMime });
        const duration = durationRef.current;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsRecording(false);
        setSeconds(0);
        durationRef.current = 0;
        recorderRef.current = null;
        if (blob.size > 0 && duration > 0) {
          const file = new globalThis.File([blob], `voice-${Date.now()}.${ext}`, {
            type: actualMime,
          });
          onComplete(file, duration);
        }
      };
      recorder.start();
      setIsRecording(true);
      setSeconds(0);
      durationRef.current = 0;
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setSeconds((t) => t + 1);
      }, 1000);
    } catch {
      cleanup();
    }
  }, [cleanup, onComplete]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    } else {
      cleanup();
    }
  }, [cleanup]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = () => {
        recorderRef.current = null;
      };
      stopRecorder(recorder);
    }
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      stopRecorder(recorderRef.current);
      recorderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { isRecording, seconds, start, stop, cancel };
}
