import { useCallback, useState } from "react";
import {
  type ChatMessage,
  addMessageToChat,
  generateClientId,
  getMyUserId,
  updateMessageInChat,
} from "@/lib/chat-store";
import { socketService } from "@/lib/socket";

export type UploadType = "image" | "file" | "voice" | "video";

export function useFileUpload(conversationId: number) {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const sendFile = useCallback(
    async (file: File, type: UploadType, durationSec?: number) => {
      setIsUploading(true);
      setProgress(0);

      const interval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 200);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!uploadRes.ok) throw new Error("Upload failed");
        const uploadData = await uploadRes.json();

        clearInterval(interval);
        setProgress(100);

        const clientMessageId = generateClientId();
        const myUserId = getMyUserId();
        const message: ChatMessage = {
          id: -Date.now(),
          clientMessageId,
          conversationId,
          senderId: myUserId,
          content: "",
          type,
          status: "sending",
          timestamp: Date.now(),
          fileName: file.name,
          fileSize: file.size,
          attachmentId: uploadData.id,
          duration: durationSec,
        };
        addMessageToChat(conversationId, message);

        socketService.sendMessage(
          {
            conversationId,
            clientMessageId,
            type,
            attachmentId: uploadData.id,
            duration: durationSec,
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
      } catch {
        clearInterval(interval);
      } finally {
        setIsUploading(false);
        setProgress(0);
      }
    },
    [conversationId],
  );

  return { sendFile, progress, isUploading };
}
