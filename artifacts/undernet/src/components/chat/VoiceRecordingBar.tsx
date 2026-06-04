import { memo } from "react";
import { Send, X } from "lucide-react";

interface VoiceRecordingBarProps {
  seconds: number;
  onCancel: () => void;
  onStop: () => void;
}

function formatRecordTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function VoiceRecordingBarImpl({ seconds, onCancel, onStop }: VoiceRecordingBarProps) {
  return (
    <div className="px-4 py-3 border-t border-border bg-card/50">
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-sm text-destructive font-medium">{formatRecordTime(seconds)}</span>
        <div className="flex-1" />
        <button
          onClick={onCancel}
          aria-label="Cancel recording"
          className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-card border border-border"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
        <button
          onClick={onStop}
          aria-label="Send voice message"
          className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export const VoiceRecordingBar = memo(VoiceRecordingBarImpl);
