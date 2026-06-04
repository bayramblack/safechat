const BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    (err as ApiError).status = res.status;
    throw err;
  }

  return res.json();
}

export interface ApiError extends Error {
  status: number;
}

export interface AuthCreateResponse {
  seedPhrase: string;
  walletAddress: string;
  userId: number;
}

export interface AuthImportResponse {
  walletAddress: string;
  userId: number;
}

export interface AuthMeResponse {
  userId: number;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  isActive: boolean;
}

export interface OtherUser {
  id: number;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  isActive: boolean;
  isOnline: boolean;
}

export interface LastMessage {
  id: number;
  type: string;
  subtype?: string | null;
  textContent: string | null;
  senderId: number;
  createdAt: string;
  status: string;
}

export interface Conversation {
  id: number;
  type: string;
  otherUser: OtherUser | null;
  lastMessage: LastMessage | null;
  createdAt: string;
  updatedAt: string;
  isNew?: boolean;
}

export interface Attachment {
  id: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
}

export interface Message {
  id: number;
  clientMessageId: string;
  conversationId: number;
  senderId: number;
  type: "text" | "image" | "file" | "voice" | "video" | "system";
  subtype?: string | null;
  textContent: string | null;
  attachment: Attachment | null;
  status: string;
  duration: number | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: number | null;
  hasMore: boolean;
}

export const api = {
  auth: {
    create(deviceInfo?: string): Promise<AuthCreateResponse> {
      return request("/auth/create", {
        method: "POST",
        body: JSON.stringify({ deviceInfo }),
      });
    },
    import(seedPhrase: string, deviceInfo?: string): Promise<AuthImportResponse> {
      return request("/auth/import", {
        method: "POST",
        body: JSON.stringify({ seedPhrase, deviceInfo }),
      });
    },
    restore(): Promise<AuthMeResponse> {
      return request("/auth/restore", { method: "POST" });
    },
    me(): Promise<AuthMeResponse> {
      return request("/auth/me");
    },
    logout(): Promise<{ success: boolean }> {
      return request("/auth/logout", { method: "POST" });
    },
    updateProfile(data: { displayName?: string; avatarUrl?: string }): Promise<AuthMeResponse> {
      return request("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
  },
  conversations: {
    list(): Promise<Conversation[]> {
      return request("/conversations");
    },
    create(walletAddress: string): Promise<Conversation> {
      return request("/conversations", {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
      });
    },
    get(id: number): Promise<Conversation> {
      return request(`/conversations/${id}`);
    },
  },
  messages: {
    list(conversationId: number, cursor?: number, limit = 50): Promise<MessagesResponse> {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", String(cursor));
      return request(`/conversations/${conversationId}/messages?${params}`);
    },
    send(
      conversationId: number,
      data: {
        type?: "text" | "image" | "file" | "voice" | "video";
        textContent?: string;
        clientMessageId: string;
        attachmentId?: number;
        duration?: number;
      },
    ): Promise<Message> {
      return request(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    markDelivered(messageId: number): Promise<void> {
      return request(`/messages/${messageId}/delivered`, { method: "PATCH" });
    },
    markRead(messageId: number): Promise<void> {
      return request(`/messages/${messageId}/read`, { method: "PATCH" });
    },
  },
};
