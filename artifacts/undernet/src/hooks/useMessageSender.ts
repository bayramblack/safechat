import { useCallback } from "react";
import {
  type ChatMessage,
  addMessageToChat,
  generateClientId,
  getMyUserId,
  updateMessageInChat,
} from "@/lib/chat-store";
import { socketService } from "@/lib/socket";

export function useMessageSender(conversationId: number) {
  return useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const clientMessageId = generateClientId();
      const myUserId = getMyUserId();
      const message: ChatMessage = {
        id: -Date.now(),
        clientMessageId,
        conversationId,
        senderId: myUserId,
        content: trimmed,
        type: "text",
        status: "sending",
        timestamp: Date.now(),
      };

      addMessageToChat(conversationId, message);

      socketService.sendMessage(
        {
          conversationId,
          clientMessageId,
          type: "text",
          textContent: trimmed,
        },
        (response) => {
          if (response.ok) {
            updateMessageInChat(conversationId, clientMessageId, {
              id: response.message.id,
              status: "sent",
            });
          } else {
            updateMessageInChat(conversationId, clientMessageId, { status: "failed" });
          }
        },
      );
    },
    [conversationId],
  );
}
