import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
}
import * as bip39 from "bip39";

const WALLET_KEY = "undernet_wallet";

export interface WalletData {
  address: string;
  userId: number;
  displayName: string;
  avatarUrl?: string;
  createdAt: number;
}

export function generateSeedPhrase(): string {
  return bip39.generateMnemonic(256);
}

export function validateSeedPhrase(phrase: string): boolean {
  return bip39.validateMnemonic(phrase.trim().toLowerCase());
}

export function saveWallet(wallet: WalletData): void {
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
}

export function loadWallet(): WalletData | null {
  const data = localStorage.getItem(WALLET_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as WalletData;
  } catch {
    return null;
  }
}

export function clearWallet(): void {
  localStorage.removeItem(WALLET_KEY);
}

export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-f0-9]{40}$/i.test(address);
}
