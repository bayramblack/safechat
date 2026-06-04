import { useState, useRef } from "react";
import { ArrowLeft, Copy, Check, Share2, Edit2, Camera, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { truncateAddress } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { useSwipeBack } from "@/hooks/useSwipeBack";

interface ProfileProps {
  walletAddress: string;
  displayName: string;
  avatarUrl?: string;
  onBack: () => void;
  onUpdateName: (name: string) => void;
  onUpdateAvatar: (url: string) => void;
}

export default function Profile({ walletAddress, displayName, avatarUrl, onBack, onUpdateName, onUpdateAvatar }: ProfileProps) {
  useSwipeBack(onBack);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "UnderNet Wallet Address",
        text: `Chat with me on UnderNet: ${walletAddress}`,
      });
    } else {
      handleCopy();
    }
  };

  const handleSaveName = () => {
    onUpdateName(nameInput.trim());
    setEditing(false);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const downloadUrl = `/api/download/${data.id}`;
      onUpdateAvatar(downloadUrl);
    } catch {
      setUploadError("Failed to upload photo. Please try again.");
      setTimeout(() => setUploadError(""), 3000);
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

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
        <h1 className="text-lg font-bold text-foreground">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full bg-card border-2 border-primary/30 flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-mono text-primary neon-glow">
                  {walletAddress.slice(2, 4).toUpperCase()}
                </span>
              )}
            </div>
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploadingPhoto}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isUploadingPhoto ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
          </div>

          {uploadError && (
            <p className="text-red-400 text-xs mt-1">{uploadError}</p>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />

          {editing ? (
            <div className="flex items-center gap-2 mb-2 w-full max-w-xs">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Display name"
                className="flex-1 h-9 px-3 bg-card border border-border rounded-lg text-sm text-foreground text-center placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                autoFocus
                maxLength={30}
              />
              <Button size="sm" onClick={handleSaveName}>Save</Button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 mb-2 group"
            >
              <h2 className="text-lg font-bold text-foreground">
                {displayName || "Set Display Name"}
              </h2>
              <Edit2 className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          )}

          <p className="text-xs text-muted-foreground font-mono mb-6 break-all text-center px-4">
            {walletAddress}
          </p>

          <div className="bg-white p-4 rounded-2xl mb-6">
            <QRCodeSVG
              value={walletAddress}
              size={180}
              bgColor="#ffffff"
              fgColor="#0a0a0a"
              level="M"
            />
          </div>

          <p className="text-xs text-muted-foreground mb-6 text-center">
            Share this QR code or address for others to message you
          </p>

          <div className="flex gap-3 w-full max-w-xs">
            <Button variant="outline" className="flex-1" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button className="flex-1" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-1.5" />
              Share
            </Button>
          </div>
        </div>

        <div className="px-6 pb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-medium text-foreground mb-2">Your Identity</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Address</span>
                <span className="text-xs text-foreground font-mono">{truncateAddress(walletAddress, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Type</span>
                <span className="text-xs text-foreground">Wallet-based</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Privacy</span>
                <span className="text-xs text-primary">Anonymous</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
