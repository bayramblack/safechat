import { useState } from "react";
import { Copy, Check, Eye, EyeOff, ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateSeedPhrase, type WalletData } from "@/lib/wallet";
import { api } from "@/lib/api";
import OpenSourceBanner from "@/components/open-source-banner";

type Step = "welcome" | "create" | "import" | "confirm";

interface OnboardingProps {
  onComplete: (wallet: WalletData) => void;
  onOpenDocs: () => void;
}

export default function Onboarding({ onComplete, onOpenDocs }: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [seed, setSeed] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [userId, setUserId] = useState(0);
  const [importSeed, setImportSeed] = useState("");
  const [importError, setImportError] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      const result = await api.auth.create(navigator.userAgent);
      setSeed(result.seedPhrase);
      setWalletAddress(result.walletAddress);
      setUserId(result.userId);
      setStep("create");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(seed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = async () => {
    const trimmed = importSeed.trim().toLowerCase();
    const words = trimmed.split(/\s+/);
    if (words.length !== 24) {
      setImportError("Seed phrase must be exactly 24 words");
      return;
    }
    if (!validateSeedPhrase(trimmed)) {
      setImportError("Invalid seed phrase. Please check your words.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.auth.import(trimmed, navigator.userAgent);
      const wallet: WalletData = {
        address: result.walletAddress,
        userId: result.userId,
        displayName: "",
        createdAt: Date.now(),
      };
      onComplete(wallet);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmBackup = () => {
    const wallet: WalletData = {
      address: walletAddress,
      userId,
      displayName: "",
      createdAt: Date.now(),
    };
    onComplete(wallet);
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {step === "welcome" && <OpenSourceBanner onOpenDocs={onOpenDocs} />}
      <div className="flex-1 flex flex-col px-6 py-8 max-w-md mx-auto w-full">
        {step !== "welcome" && (
          <button
            onClick={() => {
              if (step === "confirm") setStep("create");
              else setStep("welcome");
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 self-start"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}

        {step === "welcome" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-8">
              <span className="text-4xl font-mono font-bold text-primary neon-glow">U</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to UnderNet</h1>
            <p className="text-muted-foreground text-center text-sm mb-10">
              Your identity is a wallet. No phone number, no email, no tracking.
            </p>
            <div className="w-full space-y-3">
              <Button className="w-full" size="lg" onClick={handleCreate} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create New Wallet
              </Button>
              <Button className="w-full" size="lg" variant="outline" onClick={() => setStep("import")} disabled={isLoading}>
                Import Existing Seed
              </Button>
            </div>
            {importError && step === "welcome" && (
              <p className="text-xs text-destructive mt-4">{importError}</p>
            )}
          </div>
        )}

        {step === "create" && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-foreground mb-2">Your Seed Phrase</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Write down these 24 words in order. This is the only way to recover your wallet.
            </p>

            <div className="relative bg-card rounded-xl border border-border p-4 mb-4">
              <div className="grid grid-cols-3 gap-2">
                {seed.split(" ").map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground font-mono text-xs w-5 text-right">{i + 1}.</span>
                    <span className={`font-mono ${showSeed ? "text-foreground" : "blur-sm select-none text-foreground"}`}>
                      {word}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowSeed(!showSeed)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-secondary hover:bg-accent transition-colors"
              >
                {showSeed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button variant="outline" className="mb-6" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>

            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">
                  Never share your seed phrase. Anyone with these words can access your wallet. Store them safely offline.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setBackupConfirmed(!backupConfirmed)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  backupConfirmed ? "bg-primary border-primary" : "border-muted-foreground"
                }`}
              >
                {backupConfirmed && <Check className="w-3 h-3 text-primary-foreground" />}
              </button>
              <p className="text-sm text-foreground">I have saved my seed phrase securely</p>
            </div>

            <Button
              className="w-full mt-auto"
              size="lg"
              disabled={!backupConfirmed}
              onClick={handleConfirmBackup}
            >
              Continue
            </Button>
          </div>
        )}

        {step === "import" && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-foreground mb-2">Import Wallet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your 24-word seed phrase to restore your wallet.
            </p>

            <textarea
              value={importSeed}
              onChange={(e) => {
                setImportSeed(e.target.value);
                setImportError("");
              }}
              placeholder="Enter your 24-word seed phrase, separated by spaces..."
              className="w-full h-40 bg-card border border-border rounded-xl p-4 text-sm font-mono text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
            />

            {importError && (
              <p className="text-xs text-destructive mb-4">{importError}</p>
            )}

            <p className="text-xs text-muted-foreground mb-6">
              Words: {importSeed.trim() ? importSeed.trim().split(/\s+/).length : 0} / 24
            </p>

            <Button className="w-full mt-auto" size="lg" onClick={handleImport} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Import Wallet
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
