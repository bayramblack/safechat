import { useState, useEffect, useCallback } from "react";
import { Shield, Wifi, Bell, Download, ChevronRight, Share, MoreVertical } from "lucide-react";
import { canInstallPWA, installPWA, onInstallAvailable, isIOS, isAndroid, isStandalone } from "@/lib/pwa";
import { Button } from "@/components/ui/button";
import OpenSourceBanner from "@/components/open-source-banner";

interface InstallScreenProps {
  onContinue: () => void;
  onOpenDocs: () => void;
}

export default function InstallScreen({ onContinue, onOpenDocs }: InstallScreenProps) {
  const [canInstall, setCanInstall] = useState(canInstallPWA());
  const [installing, setInstalling] = useState(false);
  const [waitingForPrompt, setWaitingForPrompt] = useState(false);

  const showInstallButton = canInstall || (isAndroid() && !isStandalone());

  useEffect(() => {
    return onInstallAvailable((available) => {
      setCanInstall(available);
      if (available && waitingForPrompt) {
        setWaitingForPrompt(false);
        doInstall();
      }
    });
  }, [waitingForPrompt]);

  const doInstall = useCallback(async () => {
    setInstalling(true);
    const accepted = await installPWA();
    setInstalling(false);
    setWaitingForPrompt(false);
    if (accepted) onContinue();
  }, [onContinue]);

  const handleInstall = async () => {
    if (canInstall) {
      await doInstall();
    } else if (isAndroid()) {
      setWaitingForPrompt(true);
      setInstalling(true);
      setTimeout(() => {
        setWaitingForPrompt(false);
        setInstalling(false);
      }, 5000);
    }
  };

  const features = [
    { icon: Shield, title: "Private by Design", desc: "Wallet-based identity. No phone, no email." },
    { icon: Wifi, title: "Works Offline", desc: "Messages queue and send when you reconnect." },
    { icon: Bell, title: "Instant Alerts", desc: "Get notified of new messages and calls." },
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <OpenSourceBanner onOpenDocs={onOpenDocs} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-md mx-auto w-full">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 overflow-hidden">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="Safe Chat" className="w-full h-full object-cover" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2 text-center">
          Safe Chat
        </h1>
        <p className="text-muted-foreground text-center text-sm mb-10">
          Secure messenger with wallet-based identity
        </p>

        <div className="w-full space-y-4 mb-10">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center shrink-0 border border-border">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {showInstallButton && (
          <Button
            className="w-full mb-3"
            size="lg"
            onClick={handleInstall}
            disabled={installing}
          >
            <Download className="w-4 h-4 mr-2" />
            {installing ? (waitingForPrompt ? "Preparing..." : "Installing...") : "Install App"}
          </Button>
        )}

        {!showInstallButton && (
          <div className="w-full mb-4 p-4 rounded-xl bg-card border border-border">
            <p className="text-sm font-medium text-foreground mb-3">Install manually:</p>
            {isIOS() ? (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Share className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                <span>Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong></span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Download className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                <span>Click the install icon in your browser's address bar</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onContinue}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Continue without installing
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
