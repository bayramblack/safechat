import { useSyncExternalStore } from "react";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageType = "text" | "image" | "file" | "voice" | "video" | "system";

export interface ChatMessage {
  id: number;
  clientMessageId: string;
  conversationId: number;
  senderId: number;
  content: string;
  type: MessageType;
  status: MessageStatus;
  timestamp: number;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  attachmentId?: number;
  duration?: number;
  subtype?: string;
}

export interface Chat {
  id: number;
  peerAddress: string;
  peerDisplayName?: string;
  peerAvatarUrl?: string;
  peerUserId: number;
  messages: ChatMessage[];
  lastMessage?: ChatMessage;
  unreadCount: number;
  isTyping: boolean;
  isOnline: boolean;
  lastSeen?: number;
  createdAt: number;
}

type Listener = () => void;

const listListeners: Set<Listener> = new Set();
const conversationListeners = new Map<number, Set<Listener>>();
const conversationVersions = new Map<number, number>();
let listVersion = 0;

let chats: Chat[] = [];
let myUserId: number = 0;

function bumpConversation(conversationId: number): void {
  conversationVersions.set(
    conversationId,
    (conversationVersions.get(conversationId) ?? 0) + 1,
  );
}

function notifyConversation(conversationId: number): void {
  bumpConversation(conversationId);
  const set = conversationListeners.get(conversationId);
  if (set) set.forEach((l) => l());
}

function notifyList(): void {
  listVersion += 1;
  listListeners.forEach((l) => l());
}

function notifyBoth(conversationId: number): void {
  notifyConversation(conversationId);
  notifyList();
}

function notifyConversationOnly(conversationId: number): void {
  notifyConversation(conversationId);
}

function notifyListOnly(): void {
  notifyList();
}

export function setMyUserId(userId: number): void {
  myUserId = userId;
}

export function getMyUserId(): number {
  return myUserId;
}

export function subscribeToList(listener: Listener): () => void {
  listListeners.add(listener);
  return () => {
    listListeners.delete(listener);
  };
}

export function subscribeToConversation(
  conversationId: number,
  listener: Listener,
): () => void {
  let set = conversationListeners.get(conversationId);
  if (!set) {
    set = new Set();
    conversationListeners.set(conversationId, set);
  }
  set.add(listener);
  return () => {
    const s = conversationListeners.get(conversationId);
    if (s) {
      s.delete(listener);
      if (s.size === 0) conversationListeners.delete(conversationId);
    }
  };
}

export function getListVersion(): number {
  return listVersion;
}

export function getConversationVersion(conversationId: number): number {
  return conversationVersions.get(conversationId) ?? 0;
}

export function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getChats(): Chat[] {
  return chats;
}

export function setChats(newChats: Chat[]): void {
  chats = newChats;
  newChats.forEach((c) => bumpConversation(c.id));
  notifyListOnly();
}

export function getChat(conversationId: number): Chat | undefined {
  return chats.find((c) => c.id === conversationId);
}

export function upsertChat(chat: Chat): void {
  const idx = chats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) {
    chats[idx] = chat;
  } else {
    chats.unshift(chat);
  }
  notifyBoth(chat.id);
}

export function addMessageToChat(conversationId: number, message: ChatMessage): void {
  const chat = chats.find((c) => c.id === conversationId);
  if (!chat) return;

  const dupIdx = chat.messages.findIndex(
    (m) => m.clientMessageId === message.clientMessageId || (m.id > 0 && m.id === message.id),
  );
  if (dupIdx !== -1) {
    const merged: ChatMessage = { ...chat.messages[dupIdx], ...message };
    chat.messages = [
      ...chat.messages.slice(0, dupIdx),
      merged,
      ...chat.messages.slice(dupIdx + 1),
    ];
    let listAffected = false;
    if (chat.lastMessage?.clientMessageId === merged.clientMessageId) {
      chat.lastMessage = merged;
      listAffected = true;
    }
    if (listAffected) notifyBoth(conversationId);
    else notifyConversationOnly(conversationId);
    return;
  }

  chat.messages = [...chat.messages, message];
  chat.lastMessage = message;

  if (message.senderId !== myUserId) {
    chat.unreadCount += 1;
  }

  const idx = chats.indexOf(chat);
  if (idx > 0) {
    chats = [chat, ...chats.slice(0, idx), ...chats.slice(idx + 1)];
  }
  notifyBoth(conversationId);
}

export function setChatMessages(conversationId: number, messages: ChatMessage[]): void {
  const chat = chats.find((c) => c.id === conversationId);
  if (!chat) return;
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  chat.messages = sorted;
  chat.lastMessage = sorted[sorted.length - 1] ?? chat.lastMessage;
  notifyBoth(conversationId);
}

export function updateMessageInChat(
  conversationId: number,
  clientMessageId: string,
  updates: Partial<ChatMessage>,
): void {
  const chat = chats.find((c) => c.id === conversationId);
  if (!chat) return;
  const idx = chat.messages.findIndex((m) => m.clientMessageId === clientMessageId);
  if (idx === -1) return;
  const updated: ChatMessage = { ...chat.messages[idx], ...updates };
  chat.messages = [
    ...chat.messages.slice(0, idx),
    updated,
    ...chat.messages.slice(idx + 1),
  ];
  let listAffected = false;
  if (chat.lastMessage?.clientMessageId === clientMessageId) {
    chat.lastMessage = updated;
    listAffected = true;
  }
  if (listAffected) {
    notifyBoth(conversationId);
  } else {
    notifyConversationOnly(conversationId);
  }
}

export function updateMessageStatusById(
  conversationId: number,
  messageId: number,
  status: MessageStatus,
): void {
  const chat = chats.find((c) => c.id === conversationId);
  if (!chat) return;
  const idx = chat.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  if (chat.messages[idx].status === status) return;
  const updated: ChatMessage = { ...chat.messages[idx], status };
  chat.messages = [
    ...chat.messages.slice(0, idx),
    updated,
    ...chat.messages.slice(idx + 1),
  ];
  let listAffected = false;
  if (chat.lastMessage?.id === messageId) {
    chat.lastMessage = updated;
    listAffected = true;
  }
  if (listAffected) {
    notifyBoth(conversationId);
  } else {
    notifyConversationOnly(conversationId);
  }
}

export function markChatRead(conversationId: number): void {
  const chat = chats.find((c) => c.id === conversationId);
  if (chat && chat.unreadCount > 0) {
    chat.unreadCount = 0;
    notifyBoth(conversationId);
  }
}

export function setChatTyping(conversationId: number, isTyping: boolean): void {
  const chat = chats.find((c) => c.id === conversationId);
  if (!chat || chat.isTyping === isTyping) return;
  chat.isTyping = isTyping;
  notifyBoth(conversationId);
}

export function setChatOnline(userId: number, isOnline: boolean): void {
  const affected = chats.filter((c) => c.peerUserId === userId);
  if (affected.length === 0) return;
  affected.forEach((c) => {
    c.isOnline = isOnline;
    if (!isOnline) c.lastSeen = Date.now();
    bumpConversation(c.id);
    const set = conversationListeners.get(c.id);
    if (set) set.forEach((l) => l());
  });
  notifyListOnly();
}

export function clearAllChats(): void {
  const ids = chats.map((c) => c.id);
  chats = [];
  myUserId = 0;
  ids.forEach((id) => notifyConversation(id));
  notifyListOnly();
}

export function useChat(conversationId: number): Chat | undefined {
  useSyncExternalStore(
    (cb) => subscribeToConversation(conversationId, cb),
    () => getConversationVersion(conversationId),
    () => 0,
  );
  return getChat(conversationId);
}

export function useChatList(): Chat[] {
  useSyncExternalStore(
    (cb) => subscribeToList(cb),
    () => listVersion,
    () => 0,
  );
  return chats;
}
