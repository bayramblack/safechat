import { ArrowLeft, ExternalLink, FileText, Github, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AboutProps {
  onBack: () => void;
  onOpenDocs: () => void;
}

const GITHUB_URL = "https://github.com/bayramblack/safechat";

export default function About({ onBack, onOpenDocs }: AboutProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="safe-top flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">About & Open Source</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
            <span className="text-3xl font-mono font-bold text-primary neon-glow">U</span>
          </div>
          <h2 className="text-xl font-bold text-foreground">UnderNet Safe Chat</h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">v1.0.0</p>
          <p className="text-sm text-muted-foreground mt-3 max-w-sm">
            A privacy-focused 1-on-1 messenger built around wallet-based identity.
            No usernames, no email, no passwords — just a 24-word seed phrase.
          </p>
        </div>

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">License</p>
        </div>

        <div className="mx-4 mb-6 bg-card border border-border rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">MIT License</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                This project is open source. You are free to use, copy, modify,
                distribute, and self-host it — including for commercial purposes.
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source Code</p>
        </div>

        <div className="mx-4 mb-6 bg-card border border-border rounded-xl p-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
              <Github className="w-4 h-4 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">View on GitHub</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Browse the full project source, clone the repository, open issues,
                or contribute. Follow{" "}
                <code className="font-mono text-foreground">DEPLOYMENT.md</code> to
                self-host.
              </p>
            </div>
          </div>

          <Button asChild className="w-full h-11">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4 mr-2" />
              Open GitHub repository
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documentation</p>
        </div>

        <button
          onClick={onOpenDocs}
          className="w-full mx-0 px-4 py-4 flex items-center gap-3 hover:bg-card/50 transition-colors border-b border-t border-border/50 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">View documentation</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Project overview, architecture & Ubuntu deployment
            </p>
          </div>
        </button>

        <div className="px-4 pt-6 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What's Included</p>
        </div>

        <div className="px-4 pb-8">
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• Frontend (React + Vite PWA)</li>
            <li>• API server (Express + Socket.io)</li>
            <li>• PostgreSQL schema + Drizzle ORM</li>
            <li>• OpenAPI spec & generated client</li>
            <li>• <code className="font-mono text-foreground">DOCUMENTATION.md</code>, <code className="font-mono text-foreground">DEPLOYMENT.md</code>, <code className="font-mono text-foreground">README.md</code>, <code className="font-mono text-foreground">LICENSE</code></li>
            <li>• <code className="font-mono text-foreground">.env.example</code> (no secrets)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
