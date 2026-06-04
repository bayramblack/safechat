import { memo } from "react";
import { Download, File } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-store";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";
import { VideoMessagePlayer } from "./VideoMessagePlayer";
import { MessageStatusIcon } from "./MessageStatusIcon";
import { SystemMessageRow } from "./SystemMessageRow";

interface MessageRowProps {
  msg: ChatMessage;
  isMine: boolean;
  showTime: boolean;
  animateIn?: boolean;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentUrl(msg: ChatMessage) {
  if (msg.attachmentId) return `/api/download/${msg.attachmentId}`;
  return msg.fileUrl || msg.imageUrl || "";
}

function MessageRowImpl({ msg, isMine, showTime, animateIn }: MessageRowProps) {
  if (msg.type === "system") {
    return <SystemMessageRow msg={msg} showTime={showTime} />;
  }

  return (
    <div className={animateIn ? "message-enter" : undefined}>
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
      <div className={`flex mb-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
            isMine
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card border border-border text-foreground rounded-bl-sm"
          }`}
        >
          {msg.type === "image" && (
            <div className="mb-1.5 -mx-1 -mt-0.5">
              <img
                src={msg.imageUrl || getAttachmentUrl(msg)}
                alt="Shared image"
                className="rounded-xl max-w-full max-h-60 object-cover cursor-pointer"
                onClick={() => window.open(msg.imageUrl || getAttachmentUrl(msg), "_blank")}
              />
            </div>
          )}
          {msg.type === "file" && (
            <div
              className={`flex items-center gap-2 p-2 rounded-lg mb-1 ${
                isMine ? "bg-primary-foreground/10" : "bg-accent"
              }`}
            >
              <File
                className={`w-8 h-8 shrink-0 ${
                  isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-medium truncate ${
                    isMine ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {msg.fileName || "File"}
                </p>
                <p className={`text-[10px] ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {msg.fileSize ? formatFileSize(msg.fileSize) : ""}
                </p>
              </div>
              <a
                href={msg.fileUrl || getAttachmentUrl(msg)}
                download={msg.fileName}
                className={`p-1.5 rounded-lg ${
                  isMine ? "hover:bg-primary-foreground/20" : "hover:bg-accent"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <Download className={`w-4 h-4 ${isMine ? "text-primary-foreground" : "text-foreground"}`} />
              </a>
            </div>
          )}
          {msg.type === "voice" && (
            <VoiceMessagePlayer src={getAttachmentUrl(msg)} duration={msg.duration} isMine={isMine} />
          )}
          {msg.type === "video" && <VideoMessagePlayer src={getAttachmentUrl(msg)} isMine={isMine} />}
          {msg.content && msg.type === "text" && (
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          )}
          <div className={`flex items-center gap-1 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
            <span
              className={`text-[10px] ${
                isMine ? "text-primary-foreground/60" : "text-muted-foreground"
              }`}
            >
              {formatTime(msg.timestamp)}
            </span>
            {isMine && <MessageStatusIcon status={msg.status} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export const MessageRow = memo(MessageRowImpl);
