import { memo } from "react";
import { ArrowLeft, Phone, Video } from "lucide-react";
import { truncateAddress } from "@/lib/wallet";

interface ChatHeaderProps {
  peerAddress: string;
  peerDisplayName?: string;
  peerAvatarUrl?: string;
  isOnline: boolean;
  isTyping: boolean;
  lastSeen?: number;
  onBack: () => void;
  onCall: () => void;
  onVideoCall: () => void;
}

function ChatHeaderImpl({
  peerAddress,
  peerDisplayName,
  peerAvatarUrl,
  isOnline,
  isTyping,
  lastSeen,
  onBack,
  onCall,
  onVideoCall,
}: ChatHeaderProps) {
  return (
    <div className="safe-top flex items-center gap-2 px-2 pb-2 border-b border-border bg-card/50">
      <button
        onClick={onBack}
        aria-label="Back"
        className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors shrink-0"
      >
        <ArrowLeft className="w-5 h-5 text-foreground" />
      </button>
      <div className="relative w-9 h-9 shrink-0">
        <div className="w-full h-full rounded-full bg-card border border-border flex items-center justify-center overflow-hidden">
          {peerAvatarUrl ? (
            <img src={peerAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-mono text-primary">
              {peerAddress.slice(2, 4).toUpperCase()}
            </span>
          )}
        </div>
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {peerDisplayName || truncateAddress(peerAddress)}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {isTyping
            ? "typing..."
            : isOnline
              ? "online"
              : lastSeen
                ? `last seen ${new Date(lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "offline"}
        </p>
      </div>
      <button
        onClick={onVideoCall}
        aria-label="Video call"
        className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors shrink-0"
      >
        <Video className="w-[22px] h-[22px] text-primary" />
      </button>
      <button
        onClick={onCall}
        aria-label="Voice call"
        className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors shrink-0"
      >
        <Phone className="w-[22px] h-[22px] text-primary" />
      </button>
    </div>
  );
}

export const ChatHeader = memo(ChatHeaderImpl);
