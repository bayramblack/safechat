import { memo } from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImagePreviewBarProps {
  url: string;
  onCancel: () => void;
  onSend: () => void;
  disabled?: boolean;
}

function ImagePreviewBarImpl({ url, onCancel, onSend, disabled }: ImagePreviewBarProps) {
  return (
    <div className="px-4 py-3 border-t border-border bg-card/50">
      <div className="relative inline-block">
        <img src={url} alt="Preview" className="h-20 rounded-lg object-cover" />
        <button
          onClick={onCancel}
          aria-label="Cancel image"
          className="absolute -top-3 -right-3 w-11 h-11 inline-flex items-center justify-center"
        >
          <span className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
            <X className="w-3.5 h-3.5" />
          </span>
        </button>
      </div>
      <div className="flex justify-end mt-2">
        <Button size="sm" onClick={onSend} disabled={disabled}>
          <Send className="w-3.5 h-3.5 mr-1" /> Send Image
        </Button>
      </div>
    </div>
  );
}

export const ImagePreviewBar = memo(ImagePreviewBarImpl);
