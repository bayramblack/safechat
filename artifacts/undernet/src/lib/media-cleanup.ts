export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
  } catch {}
}

export function stopRecorder(recorder: MediaRecorder | null | undefined): void {
  if (!recorder) return;
  try {
    if (recorder.state === "recording" || recorder.state === "paused") {
      recorder.onstop = () => {};
      recorder.ondataavailable = () => {};
      recorder.stop();
    }
  } catch {}
}

export function stopAllMediaTracks(): void {
  try {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === "function") {
      navigator.mediaDevices.enumerateDevices().catch(() => {});
    }
  } catch {}

  document.querySelectorAll("audio, video").forEach((el) => {
    const mediaEl = el as HTMLMediaElement;
    try {
      if (mediaEl.srcObject && mediaEl.srcObject instanceof MediaStream) {
        stopStream(mediaEl.srcObject);
        mediaEl.srcObject = null;
      }
      mediaEl.pause();
    } catch {}
  });
}
