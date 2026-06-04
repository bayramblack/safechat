import { memo } from "react";
import { Phone, PhoneOff, PhoneMissed, Video } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-store";

interface SystemMessageRowProps {
  msg: ChatMessage;
  showTime: boolean;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SystemMessageRowImpl({ msg, showTime }: SystemMessageRowProps) {
  const isVideoSubtype =
    msg.subtype === "missed_video_call" ||
    msg.subtype === "video_call_ended" ||
    msg.subtype === "call_upgraded_to_video";

  const callIcon =
    msg.subtype === "missed_call" || msg.subtype === "missed_video_call" ? (
      isVideoSubtype ? (
        <Video className="w-3.5 h-3.5 text-destructive" />
      ) : (
        <PhoneMissed className="w-3.5 h-3.5 text-destructive" />
      )
    ) : msg.subtype === "call_rejected" ? (
      <PhoneOff className="w-3.5 h-3.5 text-orange-400" />
    ) : msg.subtype === "call_cancelled" ? (
      <PhoneOff className="w-3.5 h-3.5 text-muted-foreground" />
    ) : isVideoSubtype ? (
      <Video className="w-3.5 h-3.5 text-primary" />
    ) : (
      <Phone className="w-3.5 h-3.5 text-primary" />
    );

  return (
    <div>
      {showTime && (
        <div className="flex justify-center my-3">
          <span className="text-[10px] text-muted-foreground bg-card px-2 py-0.5 rounded-full">
            {new Date(msg.timestamp).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })}{" "}
            {formatTime(msg.timestamp)}
          </span>
        </div>
      )}
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card/50 border border-border/50">
          {callIcon}
          <span
            className={`text-xs ${
              msg.subtype === "missed_call" || msg.subtype === "missed_video_call"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {msg.content}
          </span>
          <span className="text-[10px] text-muted-foreground/60 ml-1">{formatTime(msg.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

export const SystemMessageRow = memo(SystemMessageRowImpl);
