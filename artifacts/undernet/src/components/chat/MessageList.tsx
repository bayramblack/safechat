import { memo, useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/chat-store";
import { MessageRow } from "./MessageRow";

interface MessageListProps {
  messages: ChatMessage[];
  myUserId: number;
  isTyping: boolean;
}

function MessageListImpl({ messages, myUserId, isTyping }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  useEffect(() => {
    prevCountRef.current = messages.length;
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">No messages yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Send a message to start the conversation
          </p>
        </div>
      )}

      {messages.map((msg, i) => {
        const isMine = msg.senderId === myUserId;
        const showTime = i === 0 || msg.timestamp - messages[i - 1].timestamp > 300000;
        const isNew = i >= prevCountRef.current;
        return (
          <MessageRow
            key={msg.clientMessageId || msg.id}
            msg={msg}
            isMine={isMine}
            showTime={showTime}
            animateIn={isNew}
          />
        );
      })}

      {isTyping && (
        <div className="flex justify-start mb-1.5">
          <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
            <div className="typing-dots">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

export const MessageList = memo(MessageListImpl);
