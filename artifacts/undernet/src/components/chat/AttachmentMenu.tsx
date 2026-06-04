import { memo } from "react";
import { File, Image as ImageIcon } from "lucide-react";

interface AttachmentMenuProps {
  onPickImage: () => void;
  onPickFile: () => void;
}

function AttachmentMenuImpl({ onPickImage, onPickFile }: AttachmentMenuProps) {
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl p-1.5 shadow-lg min-w-[160px] z-10">
      <button
        onClick={onPickImage}
        className="flex items-center gap-3 w-full px-3 min-h-[44px] rounded-lg hover:bg-accent text-sm text-foreground transition-colors"
      >
        <ImageIcon className="w-5 h-5 text-primary" />
        Image
      </button>
      <button
        onClick={onPickFile}
        className="flex items-center gap-3 w-full px-3 min-h-[44px] rounded-lg hover:bg-accent text-sm text-foreground transition-colors"
      >
        <File className="w-5 h-5 text-primary" />
        File
      </button>
    </div>
  );
}

export const AttachmentMenu = memo(AttachmentMenuImpl);
