import { io, type Socket } from "socket.io-client";

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

type StatusHandler = (status: ConnectionStatus) => void;

export interface SendMessagePayload {
  conversationId: number;
  clientMessageId: string;
  type?: "text" | "image" | "file" | "voice" | "video";
  textContent?: string;
  attachmentId?: number;
  duration?: number;
}

export interface SendMessageAckSuccess {
  ok: true;
  message: {
    id: number;
    clientMessageId: string;
    conversationId: number;
    senderId: number;
    type: string;
    subtype?: string | null;
    textContent: string | null;
    attachmentId: number | null;
    duration: number | null;
    status: string;
    createdAt: string;
  };
}

export interface SendMessageAckError {
  ok: false;
  error: string;
}

export type SendMessageAck = SendMessageAckSuccess | SendMessageAckError;

class SocketService {
  private socket: Socket | null = null;
  private status: ConnectionStatus = "disconnected";
  private statusHandlers: Set<StatusHandler> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private joinedRooms: Set<number> = new Set();

  connect(): void {
    if (this.socket?.connected) return;

    this.socket?.removeAllListeners();
    this.socket?.disconnect();

    this.setStatus("reconnecting");

    this.socket = io({
      path: "/api/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on("connect", () => {
      this.setStatus("connected");
      this.stopPolling();
      this.rejoinRooms();
    });

    this.socket.on("disconnect", () => {
      this.setStatus("disconnected");
      this.startPolling();
    });

    this.socket.on("connect_error", () => {
      this.setStatus("disconnected");
      this.startPolling();
    });

    this.socket.io.on("reconnect_attempt", () => {
      this.setStatus("reconnecting");
    });

    this.socket.io.on("reconnect", () => {
      this.setStatus("connected");
      this.stopPolling();
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus("disconnected");
    this.stopPolling();
  }

  private startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (this.socket && !this.socket.connected && navigator.onLine) {
        this.socket.connect();
      }
    }, 5000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((h) => h(status));
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    this.socket?.on(event, handler as (...a: unknown[]) => void);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.socket?.off(event, handler as (...a: unknown[]) => void);
  }

  emit(event: string, ...args: unknown[]): void {
    this.socket?.emit(event, ...args);
  }

  joinConversation(conversationId: number): void {
    this.joinedRooms.add(conversationId);
    this.socket?.emit("join_conversation", conversationId);
  }

  leaveConversation(conversationId: number): void {
    this.joinedRooms.delete(conversationId);
    this.socket?.emit("leave_conversation", conversationId);
  }

  private rejoinRooms(): void {
    this.joinedRooms.forEach((id) => {
      this.socket?.emit("join_conversation", id);
    });
  }

  sendMessage(
    data: SendMessagePayload,
    ack?: (response: SendMessageAck) => void,
    timeoutMs = 8000,
  ): void {
    if (!this.socket) {
      ack?.({ ok: false, error: "Not connected" });
      return;
    }
    if (ack) {
      this.socket
        .timeout(timeoutMs)
        .emit("new_message", data, (err: Error | null, response?: SendMessageAck) => {
          if (err) {
            ack({ ok: false, error: "timeout" });
            return;
          }
          if (!response) {
            ack({ ok: false, error: "no response" });
            return;
          }
          ack(response);
        });
    } else {
      this.socket.emit("new_message", data);
    }
  }

  sendTypingStart(conversationId: number): void {
    this.socket?.emit("typing_start", { conversationId });
  }

  sendTypingStop(conversationId: number): void {
    this.socket?.emit("typing_stop", { conversationId });
  }

  markDelivered(messageId: number, conversationId: number): void {
    this.socket?.emit("message_delivered", { messageId, conversationId });
  }

  markRead(messageId: number, conversationId: number): void {
    this.socket?.emit("message_read", { messageId, conversationId });
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
