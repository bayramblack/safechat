import { useState, useEffect } from "react";
import { ArrowLeft, Bell, Shield, LogOut, ChevronRight, Mic, Camera, AlertCircle, CheckCircle, Copy, Check, Github } from "lucide-react";
import { getNotificationPermission, requestNotificationPermission, supportsNotifications } from "@/lib/notifications";
import { webrtcService } from "@/lib/webrtc";
import { truncateAddress } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { useSwipeBack } from "@/hooks/useSwipeBack";

interface SettingsProps {
  onBack: () => void;
  onProfile: () => void;
  onAbout: () => void;
  onLogout: () => void;
  walletAddress: string;
  displayName?: string;
  avatarUrl?: string;
}

type PermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

function getPermissionDisplay(status: PermissionStatus) {
  switch (status) {
    case "granted":
      return { icon: CheckCircle, color: "text-primary", label: "Granted" };
    case "denied":
      return { icon: AlertCircle, color: "text-destructive", label: "Denied" };
    case "prompt":
      return { icon: AlertCircle, color: "text-yellow-500", label: "Not set" };
    case "unsupported":
      return { icon: AlertCircle, color: "text-muted-foreground", label: "Unsupported" };
  }
}

export default function Settings({ onBack, onProfile, onAbout, onLogout, walletAddress, displayName, avatarUrl }: SettingsProps) {
  useSwipeBack(onBack);
  const [notifPerm, setNotifPerm] = useState<PermissionStatus>(
    supportsNotifications()
      ? (getNotificationPermission() === "default" ? "prompt" : getNotificationPermission() as PermissionStatus)
      : "unsupported"
  );
  const [micPerm, setMicPerm] = useState<PermissionStatus>("prompt");
  const [camPerm, setCamPerm] = useState<PermissionStatus>("prompt");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => {
        setMicPerm(result.state as PermissionStatus);
        result.onchange = () => setMicPerm(result.state as PermissionStatus);
      }).catch(() => {});
      navigator.permissions.query({ name: "camera" as PermissionName }).then((result) => {
        setCamPerm(result.state as PermissionStatus);
        result.onchange = () => setCamPerm(result.state as PermissionStatus);
      }).catch(() => {});
    }
  }, []);

  const handleRequestNotif = async () => {
    const result = await requestNotificationPermission();
    setNotifPerm(result === "default" ? "prompt" : result as PermissionStatus);
  };

  const handleRequestMic = async () => {
    const granted = await webrtcService.requestMicPermission();
    setMicPerm(granted ? "granted" : "denied");
  };

  const handleRequestCam = async () => {
    const granted = await webrtcService.requestCameraPermission();
    setCamPerm(granted ? "granted" : "denied");
  };

  const handleCopyAddress = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const notifDisplay = getPermissionDisplay(notifPerm);
  const micDisplay = getPermissionDisplay(micPerm);
  const camDisplay = getPermissionDisplay(camPerm);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="safe-top flex items-center gap-2 px-2 pb-2 border-b border-border">
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="px-4 pt-6 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Profile</p>
        </div>

        <button
          onClick={onProfile}
          className="w-full flex items-center gap-3 px-4 py-4 hover:bg-card/50 transition-colors border-b border-border/50"
        >
          <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center overflow-hidden shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName || "Profile"} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-mono text-primary">
                {displayName ? displayName.charAt(0).toUpperCase() : walletAddress.slice(2, 4).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-foreground">
              {displayName || "Set Display Name"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-muted-foreground font-mono truncate">{truncateAddress(walletAddress)}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
              <p className="text-xs text-foreground font-mono truncate">{walletAddress}</p>
            </div>
            <button
              onClick={handleCopyAddress}
              className="ml-3 p-2 rounded-lg hover:bg-accent transition-colors shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-primary" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        <div className="h-6" />

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notifications</p>
        </div>

        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center">
                <Bell className="w-4 h-4 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-foreground">Push Notifications</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <notifDisplay.icon className={`w-3 h-3 ${notifDisplay.color}`} />
                  <span className={`text-[10px] ${notifDisplay.color}`}>{notifDisplay.label}</span>
                </div>
              </div>
            </div>
            {notifPerm !== "granted" && notifPerm !== "unsupported" && (
              <Button size="sm" variant="outline" onClick={handleRequestNotif}>
                {notifPerm === "denied" ? "Retry" : "Enable"}
              </Button>
            )}
          </div>
          {notifPerm === "denied" && (
            <p className="text-xs text-muted-foreground mt-2 ml-12">
              Notifications are blocked. To enable, go to your browser settings and allow notifications for this site.
            </p>
          )}
        </div>

        <div className="h-6" />

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Permissions</p>
        </div>

        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center">
                <Mic className="w-4 h-4 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-foreground">Microphone</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <micDisplay.icon className={`w-3 h-3 ${micDisplay.color}`} />
                  <span className={`text-[10px] ${micDisplay.color}`}>{micDisplay.label}</span>
                </div>
              </div>
            </div>
            {micPerm !== "granted" && micPerm !== "unsupported" && (
              <Button size="sm" variant="outline" onClick={handleRequestMic}>
                Request
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 ml-12">
            Required for voice calls and voice messages.
          </p>
        </div>

        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center">
                <Camera className="w-4 h-4 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-foreground">Camera</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <camDisplay.icon className={`w-3 h-3 ${camDisplay.color}`} />
                  <span className={`text-[10px] ${camDisplay.color}`}>{camDisplay.label}</span>
                </div>
              </div>
            </div>
            {camPerm !== "granted" && camPerm !== "unsupported" && (
              <Button size="sm" variant="outline" onClick={handleRequestCam}>
                Request
              </Button>
            )}
          </div>
        </div>

        <div className="h-6" />

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Security</p>
        </div>

        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center">
              <Shield className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm text-foreground">Wallet-Based Identity</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your identity is secured by your wallet. No server stores your credentials.
              </p>
            </div>
          </div>
        </div>

        <div className="h-6" />

        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">About</p>
        </div>

        <button
          onClick={onAbout}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card/50 transition-colors border-b border-border/50 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center shrink-0">
            <Github className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">About & Open Source</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              MIT licensed · View on GitHub · View documentation
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

        <div className="px-4 py-3 border-b border-border/50">
          <p className="text-xs text-muted-foreground font-mono">UnderNet Safe Chat v1.0.0 · MIT</p>
        </div>

        <div className="px-4 pt-10 pb-4">
          <Button
            className="w-full h-12 bg-destructive text-destructive-foreground hover:bg-destructive/90 text-base font-semibold"
            onClick={() => setShowLogoutConfirm(true)}
          >
            <LogOut className="w-5 h-5 mr-2" />
            Log Out
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-3">
            Make sure you have your seed phrase backed up before logging out
          </p>
        </div>

        <div className="h-8" />
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-2">Log Out?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Your wallet and all local data will be deleted. Make sure you've saved your seed phrase.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onLogout}
              >
                Log Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
