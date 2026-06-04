import { useEffect } from "react";
import { socketService } from "@/lib/socket";
import {
  type ChatMessage,
  addMessageToChat,
  markChatRead,
  setChatTyping,
  updateMessageInChat,
  updateMessageStatusById,
} from "@/lib/chat-store";

interface MessageSavedPayload {
  id: number;
  clientMessageId: string;
  conversationId: number;
  senderId: number;
  type: string;
  textContent: string | null;
  status: string;
  createdAt: string;
}

interface NewMessagePayload extends MessageSavedPayload {
  subtype?: string | null;
  duration?: number;
  attachmentId?: number | null;
}

interface MessageStatusPayload {
  messageId: number;
  deliveredAt?: string;
  readAt?: string;
}

interface TypingPayload {
  userId: number;
  conversationId: number;
}

export function useChatSocket(conversationId: number): void {
  useEffect(() => {
    socketService.joinConversation(conversationId);
    return () => {
      socketService.leaveConversation(conversationId);
    };
  }, [conversationId]);

  useEffect(() => {
    const handleMessageSaved = (data: MessageSavedPayload) => {
      if (data.conversationId !== conversationId) return;
      updateMessageInChat(conversationId, data.clientMessageId, {
        id: data.id,
        status: (data.status as ChatMessage["status"]) || "sent",
      });
    };

    const handleNewMessage = (data: NewMessagePayload) => {
      if (data.conversationId !== conversationId) return;
      const msg: ChatMessage = {
        id: data.id,
        clientMessageId: data.clientMessageId,
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.textContent || "",
        type: (data.type as ChatMessage["type"]) || "text",
        subtype: data.subtype ?? undefined,
        status: (data.status as ChatMessage["status"]) || "sent",
        timestamp: new Date(data.createdAt).getTime(),
        duration: data.duration,
        attachmentId: data.attachmentId ?? undefined,
      };
      addMessageToChat(data.conversationId, msg);
      markChatRead(conversationId);

      if (data.type !== "system") {
        socketService.markDelivered(data.id, data.conversationId);
        socketService.markRead(data.id, data.conversationId);
      }
    };

    const handleDelivered = (data: MessageStatusPayload) => {
      updateMessageStatusById(conversationId, data.messageId, "delivered");
    };

    const handleRead = (data: MessageStatusPayload) => {
      updateMessageStatusById(conversationId, data.messageId, "read");
    };

    const handleTypingStart = (data: TypingPayload) => {
      if (data.conversationId === conversationId) setChatTyping(conversationId, true);
    };

    const handleTypingStop = (data: TypingPayload) => {
      if (data.conversationId === conversationId) setChatTyping(conversationId, false);
    };

    socketService.on("message_saved", handleMessageSaved as (...args: unknown[]) => void);
    socketService.on("new_message", handleNewMessage as (...args: unknown[]) => void);
    socketService.on("message_delivered", handleDelivered as (...args: unknown[]) => void);
    socketService.on("message_read", handleRead as (...args: unknown[]) => void);
    socketService.on("typing_start", handleTypingStart as (...args: unknown[]) => void);
    socketService.on("typing_stop", handleTypingStop as (...args: unknown[]) => void);

    return () => {
      socketService.off("message_saved", handleMessageSaved as (...args: unknown[]) => void);
      socketService.off("new_message", handleNewMessage as (...args: unknown[]) => void);
      socketService.off("message_delivered", handleDelivered as (...args: unknown[]) => void);
      socketService.off("message_read", handleRead as (...args: unknown[]) => void);
      socketService.off("typing_start", handleTypingStart as (...args: unknown[]) => void);
      socketService.off("typing_stop", handleTypingStop as (...args: unknown[]) => void);
    };
  }, [conversationId]);
}
