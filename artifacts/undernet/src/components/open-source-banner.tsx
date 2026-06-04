import { useEffect, useState } from "react";
import { FileText, Github, X } from "lucide-react";

interface OpenSourceBannerProps {
  onOpenDocs: () => void;
}

const STORAGE_KEY = "undernet_oss_banner_dismissed";
const GITHUB_URL = "https://github.com/bayramblack/safechat";

export default function OpenSourceBanner({ onOpenDocs }: OpenSourceBannerProps) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  if (dismissed !== false) return null;

  return (
    <div className="w-full max-w-md mx-auto px-4 pt-3">
      <div className="bg-card/60 border border-border rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary font-mono text-[10px] font-bold tracking-wide shrink-0">
          MIT
        </span>
        <span className="text-muted-foreground hidden sm:inline shrink-0">Open source</span>
        <button
          onClick={onOpenDocs}
          className="inline-flex items-center gap-1 text-foreground hover:text-primary transition-colors shrink-0"
        >
          <FileText className="w-3 h-3" />
          View docs
        </button>
        <span className="text-muted-foreground shrink-0">·</span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:text-primary transition-colors shrink-0"
        >
          <Github className="w-3 h-3" />
          GitHub
        </a>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss open source notice"
          className="ml-auto p-1 -m-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
