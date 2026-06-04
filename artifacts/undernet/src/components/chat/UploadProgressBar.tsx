import { memo, type CSSProperties } from "react";

interface UploadProgressBarProps {
  progress: number;
}

function UploadProgressBarImpl({ progress }: UploadProgressBarProps) {
  const trackStyle = { "--progress": progress } as CSSProperties;
  return (
    <div className="px-4 py-2 border-t border-border bg-card/50">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Uploading...</span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden" style={trackStyle}>
          <div className="progress-fill h-full bg-primary rounded-full" />
        </div>
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>
    </div>
  );
}

export const UploadProgressBar = memo(UploadProgressBarImpl);
