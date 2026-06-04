import { useCallback, useEffect, useRef } from "react";
import { socketService } from "@/lib/socket";

export function useTypingIndicator(conversationId: number) {
  const isTypingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socketService.sendTypingStop(conversationId);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [conversationId]);

  const notifyTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketService.sendTypingStart(conversationId);
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socketService.sendTypingStop(conversationId);
      timeoutRef.current = null;
    }, 3000);
  }, [conversationId]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (isTypingRef.current) {
        socketService.sendTypingStop(conversationId);
        isTypingRef.current = false;
      }
    };
  }, [conversationId]);

  return { notifyTyping, stop };
}
