import { memo } from "react";
import { Check, CheckCheck, Loader2 } from "lucide-react";
import type { MessageStatus } from "@/lib/chat-store";

interface MessageStatusIconProps {
  status: MessageStatus;
}

function MessageStatusIconImpl({ status }: MessageStatusIconProps) {
  switch (status) {
    case "sending":
      return <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />;
    case "sent":
      return <Check className="w-3 h-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="w-3 h-3 text-primary" />;
    case "failed":
      return <span className="text-[10px] text-destructive">!</span>;
    default:
      return null;
  }
}

export const MessageStatusIcon = memo(MessageStatusIconImpl);
