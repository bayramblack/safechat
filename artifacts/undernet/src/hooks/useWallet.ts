import { useState, useEffect, useCallback } from "react";
import { type WalletData, loadWallet, saveWallet, clearWallet } from "@/lib/wallet";
import { api } from "@/lib/api";

export function useWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = loadWallet();
    if (saved) {
      api.auth
        .restore()
        .then((data) => {
          const updated: WalletData = {
            ...saved,
            address: data.walletAddress,
            userId: data.userId,
            displayName: data.displayName || saved.displayName || "",
            avatarUrl: data.avatarUrl || saved.avatarUrl || undefined,
          };
          saveWallet(updated);
          setWallet(updated);
        })
        .catch(() => {
          clearWallet();
          setWallet(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((w: WalletData) => {
    saveWallet(w);
    setWallet(w);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    clearWallet();
    setWallet(null);
  }, []);

  const updateDisplayName = useCallback(
    (name: string) => {
      if (!wallet) return;
      const updated = { ...wallet, displayName: name };
      saveWallet(updated);
      setWallet(updated);
      api.auth.updateProfile({ displayName: name }).catch(() => {});
    },
    [wallet],
  );

  const updateAvatarUrl = useCallback(
    (avatarUrl: string) => {
      if (!wallet) return;
      const updated = { ...wallet, avatarUrl };
      saveWallet(updated);
      setWallet(updated);
      api.auth.updateProfile({ avatarUrl }).catch(() => {});
    },
    [wallet],
  );

  return { wallet, loading, login, logout, updateDisplayName, updateAvatarUrl };
}
