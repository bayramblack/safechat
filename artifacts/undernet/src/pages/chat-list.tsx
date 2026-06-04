import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { MessageSquarePlus, Search, Wifi, WifiOff, Loader2, Settings, Bot } from "lucide-react";
import {
  type Chat,
  getChat,
  setChats,
  upsertChat,
  useChatList,
  addMessageToChat,
  setChatOnline,
  setChatTyping,
  type ChatMessage,
  setMyUserId,
} from "@/lib/chat-store";
import { truncateAddress, isValidAddress } from "@/lib/wallet";
import { useConnection } from "@/hooks/useConnection";
import { api, type Conversation } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { Button } from "@/components/ui/button";

interface ChatListProps {
  onOpenChat: (conversationId: number) => void;
  onOpenAiChat: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  walletAddress: string;
  userId: number;
  displayName?: string;
  avatarUrl?: string;
  /** Desktop two-pane: id of the conversation shown in the right panel. */
  selectedConversationId?: number;
  /** Desktop two-pane: whether the AI chat is the active right-panel view. */
  aiChatActive?: boolean;
}

function conversationToChat(conv: Conversation): Chat {
  const lastMessage = conv.lastMessage
    ? {
        id: conv.lastMessage.id,
        clientMessageId: "",
        conversationId: conv.id,
        senderId: conv.lastMessage.senderId,
        content: conv.lastMessage.textContent || "",
        type: (conv.lastMessage.type || "text") as ChatMessage["type"],
        subtype: conv.lastMessage.subtype ?? undefined,
        status: (conv.lastMessage.status || "sent") as ChatMessage["status"],
        timestamp: new Date(conv.lastMessage.createdAt).getTime(),
      }
    : undefined;

  return {
    id: conv.id,
    peerAddress: conv.otherUser?.walletAddress || "",
    peerDisplayName: conv.otherUser?.displayName || undefined,
    peerAvatarUrl: conv.otherUser?.avatarUrl || undefined,
    peerUserId: conv.otherUser?.id || 0,
    messages: [],
    lastMessage,
    unreadCount: 0,
    isTyping: false,
    isOnline: conv.otherUser?.isOnline || false,
    lastSeen: conv.otherUser?.lastSeenAt ? new Date(conv.otherUser.lastSeenAt).getTime() : undefined,
    createdAt: new Date(conv.createdAt).getTime(),
  };
}

export default function ChatList({ onOpenChat, onOpenAiChat, onOpenSettings, onOpenProfile, walletAddress, userId, displayName, avatarUrl, selectedConversationId, aiChatActive }: ChatListProps) {
  const chats = useChatList();
  const [showNewChat, setShowNewChat] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const connectionStatus = useConnection();
  const loadedRef = useRef(false);

  useEffect(() => {
    setMyUserId(userId);
  }, [userId]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    api.conversations.list().then((conversations) => {
      const chatList = conversations.map(conversationToChat);
      setChats(chatList);
      chatList.forEach((chat) => {
        socketService.joinConversation(chat.id);
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleNewMessage = async (data: {
      id: number;
      clientMessageId: string;
      conversationId: number;
      senderId: number;
      type: string;
      textContent: string | null;
      status: string;
      createdAt: string;
    }) => {
      let chat = getChat(data.conversationId);
      if (!chat) {
        try {
          const conv = await api.conversations.get(data.conversationId);
          chat = conversationToChat(conv);
          upsertChat(chat);
          socketService.joinConversation(data.conversationId);
        } catch {
          return;
        }
      }
      const msg: ChatMessage = {
        id: data.id,
        clientMessageId: data.clientMessageId,
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.textContent || "",
        type: (data.type as ChatMessage["type"]) || "text",
        status: (data.status as ChatMessage["status"]) || "sent",
        timestamp: new Date(data.createdAt).getTime(),
      };
      addMessageToChat(data.conversationId, msg);
    };

    const handleOnline = (data: { userId: number }) => {
      setChatOnline(data.userId, true);
    };

    const handleOffline = (data: { userId: number }) => {
      setChatOnline(data.userId, false);
    };

    const handleTypingStart = (data: { userId: number; conversationId: number }) => {
      setChatTyping(data.conversationId, true);
    };

    const handleTypingStop = (data: { userId: number; conversationId: number }) => {
      setChatTyping(data.conversationId, false);
    };

    socketService.on("new_message", handleNewMessage as (...args: unknown[]) => void);
    socketService.on("user_online", handleOnline as (...args: unknown[]) => void);
    socketService.on("user_offline", handleOffline as (...args: unknown[]) => void);
    socketService.on("typing_start", handleTypingStart as (...args: unknown[]) => void);
    socketService.on("typing_stop", handleTypingStop as (...args: unknown[]) => void);

    return () => {
      socketService.off("new_message", handleNewMessage as (...args: unknown[]) => void);
      socketService.off("user_online", handleOnline as (...args: unknown[]) => void);
      socketService.off("user_offline", handleOffline as (...args: unknown[]) => void);
      socketService.off("typing_start", handleTypingStart as (...args: unknown[]) => void);
      socketService.off("typing_stop", handleTypingStop as (...args: unknown[]) => void);
    };
  }, []);

  const handleNewChat = useCallback(async () => {
    const trimmed = newAddress.trim();
    if (!trimmed) {
      setAddressError("Please enter a wallet address");
      return;
    }
    if (!isValidAddress(trimmed)) {
      setAddressError("Invalid wallet address format");
      return;
    }
    if (trimmed.toLowerCase() === walletAddress.toLowerCase()) {
      setAddressError("You can't chat with yourself");
      return;
    }

    setIsCreating(true);
    try {
      const conv = await api.conversations.create(trimmed);
      const chat = conversationToChat(conv);
      upsertChat(chat);
      socketService.joinConversation(conv.id);
      setShowNewChat(false);
      setNewAddress("");
      setAddressError("");
      onOpenChat(conv.id);
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "Failed to create conversation");
    } finally {
      setIsCreating(false);
    }
  }, [newAddress, walletAddress, onOpenChat]);

  const filteredChats = useMemo(() => {
    if (!searchQuery) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter(
      (c) =>
        c.peerAddress.toLowerCase().includes(q) ||
        (c.peerDisplayName && c.peerDisplayName.toLowerCase().includes(q)),
    );
  }, [chats, searchQuery]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="safe-top px-3 pb-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenProfile}
              aria-label="Profile"
              className="w-11 h-11 inline-flex items-center justify-center hover:bg-accent rounded-full transition-colors shrink-0 -ml-1"
            >
              <span className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName || "Profile"} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-mono text-primary">
                    {displayName ? displayName.charAt(0).toUpperCase() : walletAddress.slice(2, 4).toUpperCase()}
                  </span>
                )}
              </span>
            </button>
            <h1 className="text-lg font-bold text-foreground">Chats</h1>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-card border border-border">
              {connectionStatus === "connected" ? (
                <Wifi className="w-3 h-3 text-primary" />
              ) : connectionStatus === "reconnecting" ? (
                <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" />
              ) : (
                <WifiOff className="w-3 h-3 text-destructive" />
              )}
              <span className="text-[10px] text-muted-foreground capitalize hidden min-[360px]:inline">{connectionStatus}</span>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            aria-label="Settings"
            className="w-11 h-11 inline-flex items-center justify-center hover:bg-accent rounded-full transition-colors shrink-0 -mr-1"
          >
            <span className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center">
              <Settings className="w-4.5 h-4.5 text-muted-foreground" />
            </span>
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-9 pr-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {!searchQuery && (
          <button
            onClick={onOpenAiChat}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-border/50 ${aiChatActive ? "bg-card" : "hover:bg-card/50 active:bg-card"}`}
          >
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-white" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-medium text-foreground truncate">
                  UnderNet GPT
                </span>
                <span className="text-[10px] text-violet-400 shrink-0 ml-2 px-1.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">
                  AI
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">
                  Your private AI assistant
                </span>
              </div>
            </div>
          </button>
        )}

        {filteredChats.length === 0 && !searchQuery && (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <p className="text-xs text-muted-foreground text-center">
              Start a new chat by entering a wallet address
            </p>
          </div>
        )}

        {filteredChats.length === 0 && searchQuery && (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <p className="text-sm font-medium text-foreground mb-1">No results</p>
            <p className="text-xs text-muted-foreground text-center">
              No conversations match your search
            </p>
          </div>
        )}

        {filteredChats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onOpenChat(chat.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-border/50 ${chat.id === selectedConversationId ? "bg-card" : "hover:bg-card/50 active:bg-card"}`}
          >
            <div className="relative w-10 h-10 shrink-0">
              <div className="w-full h-full rounded-full bg-card border border-border flex items-center justify-center overflow-hidden">
                {chat.peerAvatarUrl ? (
                  <img src={chat.peerAvatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-mono text-primary">
                    {chat.peerAddress.slice(2, 4).toUpperCase()}
                  </span>
                )}
              </div>
              {chat.isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-primary border-2 border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-medium text-foreground truncate">
                  {chat.peerDisplayName || truncateAddress(chat.peerAddress)}
                </span>
                {chat.lastMessage && (
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {formatTime(chat.lastMessage.timestamp)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate">
                  {chat.isTyping
                    ? "typing..."
                    : chat.lastMessage
                      ? chat.lastMessage.type === "system"
                        ? `📞 ${chat.lastMessage.content}`
                        : chat.lastMessage.type === "image"
                          ? "Image"
                          : chat.lastMessage.type === "file"
                            ? "File"
                            : chat.lastMessage.content
                      : "No messages yet"}
                </span>
                {chat.unreadCount > 0 && (
                  <span className="ml-2 shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {chat.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="safe-bottom px-3 pt-2 border-t border-border">
        <Button className="w-full h-11" onClick={() => setShowNewChat(true)}>
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end justify-center">
          <div className="w-full max-w-md bg-card border-t border-border rounded-t-2xl p-6 animate-in slide-in-from-bottom duration-300">
            <h3 className="text-lg font-bold text-foreground mb-1">New Chat</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter a wallet address to start chatting
            </p>
            <input
              type="text"
              placeholder="0x..."
              value={newAddress}
              onChange={(e) => {
                setNewAddress(e.target.value);
                setAddressError("");
              }}
              className="w-full h-11 px-4 bg-background border border-border rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
              autoFocus
            />
            {addressError && (
              <p className="text-xs text-destructive mb-2">{addressError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowNewChat(false);
                  setNewAddress("");
                  setAddressError("");
                }}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleNewChat} disabled={isCreating}>
                {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Start Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
