import { memo, useRef, useState, type ChangeEvent } from "react";
import { Mic, Paperclip, Send, Video } from "lucide-react";
import { AttachmentMenu } from "./AttachmentMenu";
import { triggerHaptic } from "@/lib/haptics";

interface MessageComposerProps {
  onSendText: (text: string) => void;
  onTyping: () => void;
  onPickImage: (file: File) => void;
  onPickFile: (file: File) => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onCancelVoice: () => void;
  onStartVideo: () => void;
}

function MessageComposerImpl({
  onSendText,
  onTyping,
  onPickImage,
  onPickFile,
  onStartVoice,
  onStopVoice,
  onCancelVoice,
  onStartVideo,
}: MessageComposerProps) {
  const [input, setInput] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    triggerHaptic(10);
    onSendText(text);
    setInput("");
  };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPickImage(file);
    e.target.value = "";
    setShowAttach(false);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPickFile(file);
    e.target.value = "";
    setShowAttach(false);
  };

  return (
    <div className="safe-bottom border-t border-border bg-card/30">
      <div className="flex items-end gap-1 px-2 pt-2">
        <div className="relative">
          <button
            onClick={() => setShowAttach((v) => !v)}
            aria-label="Attach"
            className="tap-scale w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-accent transition-colors shrink-0"
          >
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </button>
          {showAttach && (
            <AttachmentMenu
              onPickImage={() => imageInputRef.current?.click()}
              onPickFile={() => fileInputRef.current?.click()}
            />
          )}
        </div>
        <input
          type="text"
          placeholder="Message..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 min-w-0 h-11 px-3 bg-background border border-border rounded-full text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        {input.trim() ? (
          <button
            onClick={handleSend}
            aria-label="Send message"
            className="tap-scale w-11 h-11 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                triggerHaptic(15);
                onStartVoice();
              }}
              onMouseUp={onStopVoice}
              onMouseLeave={onStopVoice}
              onTouchStart={(e) => {
                e.preventDefault();
                triggerHaptic(15);
                onStartVoice();
              }}
              onTouchEnd={onStopVoice}
              onTouchCancel={onCancelVoice}
              aria-label="Hold to record voice message"
              className="tap-scale w-11 h-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary transition-colors select-none shrink-0"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                triggerHaptic(10);
                onStartVideo();
              }}
              aria-label="Record video"
              className="tap-scale w-11 h-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary transition-colors shrink-0"
            >
              <Video className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
    </div>
  );
}

export const MessageComposer = memo(MessageComposerImpl);
