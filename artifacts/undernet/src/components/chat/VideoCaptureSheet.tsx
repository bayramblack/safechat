import { memo, type RefObject } from "react";
import { RefreshCw, Send, Square, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoCaptureSheetProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  isRecording: boolean;
  isSwitchingCamera: boolean;
  recordingTime: number;
  previewUrl: string | null;
  uploading: boolean;
  onSwitchCamera: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancel: () => void;
  onSend: () => void;
}

function formatRecordTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function VideoCaptureSheetImpl({
  videoRef,
  isRecording,
  isSwitchingCamera,
  recordingTime,
  previewUrl,
  uploading,
  onSwitchCamera,
  onStartRecording,
  onStopRecording,
  onCancel,
  onSend,
}: VideoCaptureSheetProps) {
  return (
    <div className="px-4 py-3 border-t border-border bg-card/50">
      {!previewUrl ? (
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-full">
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full max-h-48 rounded-lg bg-black object-cover"
            />
            <button
              onClick={onSwitchCamera}
              disabled={isSwitchingCamera}
              aria-label="Switch camera"
              className="absolute top-2 right-2 w-11 h-11 inline-flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSwitchingCamera ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {isRecording ? (
              <>
                <span className="text-xs text-destructive font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  {formatRecordTime(recordingTime)} / 0:30
                </span>
                <button
                  onClick={onStopRecording}
                  aria-label="Stop recording"
                  className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <Square className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={onStartRecording}
                aria-label="Start recording"
                className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              >
                <Video className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onCancel}
              aria-label="Cancel"
              className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-card border border-border"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <video
            src={previewUrl}
            controls
            playsInline
            className="w-full max-h-48 rounded-lg bg-black object-cover"
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={onSend} disabled={uploading}>
              <Send className="w-3.5 h-3.5 mr-1" /> Send Video
            </Button>
            <button
              onClick={onCancel}
              aria-label="Cancel"
              className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-card border border-border"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const VideoCaptureSheet = memo(VideoCaptureSheetImpl);
