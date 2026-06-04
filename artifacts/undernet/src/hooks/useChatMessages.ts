import { useEffect, useRef } from "react";
import {
  type Chat,
  type ChatMessage,
  getChat,
  markChatRead,
  setChatMessages,
  useChat,
} from "@/lib/chat-store";
import { api, type Message } from "@/lib/api";

function toChatMessage(msg: Message): ChatMessage {
  return {
    id: msg.id,
    clientMessageId: msg.clientMessageId,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    content: msg.textContent || "",
    type: msg.type,
    subtype: msg.subtype ?? undefined,
    status: msg.status as ChatMessage["status"],
    timestamp: new Date(msg.createdAt).getTime(),
    attachmentId: msg.attachment?.id,
    fileName: msg.attachment?.originalName,
    fileSize: msg.attachment?.fileSize,
    duration: msg.duration ?? undefined,
  };
}

export function useChatMessages(conversationId: number): Chat | undefined {
  const chat = useChat(conversationId);
  const loadedRef = useRef<number | null>(null);

  useEffect(() => {
    if (loadedRef.current === conversationId) return;
    loadedRef.current = conversationId;
    api.messages
      .list(conversationId)
      .then((res) => {
        const existing = getChat(conversationId);
        if (!existing) return;

        const fetched = res.messages.map(toChatMessage);
        const optimistic = existing.messages.filter(
          (m) => m.id <= 0 && !fetched.some((f) => f.clientMessageId === m.clientMessageId),
        );
        setChatMessages(conversationId, [...fetched, ...optimistic]);
        markChatRead(conversationId);
      })
      .catch(() => {});
  }, [conversationId]);

  return chat;
}
