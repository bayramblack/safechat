import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Bot, Trash2, Loader2 } from "lucide-react";
import { useSwipeBack } from "@/hooks/useSwipeBack";

const AI_CHAT_URL = "/api/ai/chat";
const AI_STORAGE_PREFIX = "undernet_ai_chat_history";
const MAX_HISTORY = 100;

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function getStorageKey(): string {
  try {
    const raw = localStorage.getItem("undernet_wallet");
    if (raw) {
      const wallet = JSON.parse(raw);
      if (wallet.userId) return `${AI_STORAGE_PREFIX}:${wallet.userId}`;
    }
  } catch {}
  return AI_STORAGE_PREFIX;
}

function loadMessages(): AiMessage[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveMessages(msgs: AiMessage[]) {
  try {
    const trimmed = msgs.slice(-MAX_HISTORY);
    localStorage.setItem(getStorageKey(), JSON.stringify(trimmed));
  } catch {}
}

export function clearAiChatHistory() {
  try {
    localStorage.removeItem(getStorageKey());
  } catch {}
}

interface AiChatScreenProps {
  onBack: () => void;
}

export default function AiChatScreen({ onBack }: AiChatScreenProps) {
  useSwipeBack(onBack);
  const [messages, setMessages] = useState<AiMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: AiMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: AiMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(AI_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`AI error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              const captured = fullText;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: captured } : m
                )
              );
            }
          } catch {}
        }
      }

      if (!fullText.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "I couldn't generate a response. Please try again." }
              : m
          )
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Something went wrong. Please try again." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages]);

  const handleClear = () => {
    if (isStreaming && abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setIsStreaming(false);
    localStorage.removeItem(AI_STORAGE_KEY);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="safe-top flex items-center gap-2 px-2 pb-2 border-b border-border">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-white" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              UnderNet GPT
            </p>
            <p className="text-[11px] text-primary">
              {isStreaming ? "typing..." : "AI Assistant"}
            </p>
          </div>
        </div>
        <button
          onClick={handleClear}
          aria-label="Clear chat"
          className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors shrink-0"
          title="Clear chat"
        >
          <Trash2 className="w-[18px] h-[18px] text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-500/20 border border-violet-500/30 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-violet-400" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              UnderNet GPT
            </p>
            <p className="text-xs text-muted-foreground text-center mb-4 max-w-[260px]">
              Your private AI assistant. Ask anything — your conversations stay on your device.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[300px]">
              {["What can you do?", "Tell me a joke", "Help me code"].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className="px-3 py-1.5 rounded-full bg-card border border-border text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    {suggestion}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id}>
              <div
                className={`flex mb-1.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shrink-0 mr-1.5 mt-1">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border text-foreground rounded-bl-sm"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                    {!isUser && isStreaming && msg.content === "" && (
                      <span className="typing-dots ml-1 align-middle">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    )}
                  </p>
                  <div
                    className={`flex items-center gap-1 mt-0.5 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <span
                      className={`text-[10px] ${isUser ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                    >
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {isStreaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content !== "" && (
          <div className="flex justify-start mb-1.5 ml-7">
            <div className="flex items-center gap-1 px-2 py-1">
              <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
              <span className="text-[10px] text-muted-foreground">streaming...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="safe-bottom border-t border-border bg-card/30">
        <div className="flex items-end gap-1.5 px-2 pt-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask UnderNet GPT..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isStreaming}
            className="flex-1 min-w-0 h-11 px-4 bg-background border border-border rounded-full text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            aria-label="Send"
            className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-500 text-white transition-opacity shrink-0 disabled:opacity-40"
          >
            {isStreaming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
