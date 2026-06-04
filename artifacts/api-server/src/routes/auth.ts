import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateMnemonic, validateMnemonic } from "bip39";
import { hashToken, generateSessionToken, hashSeed, authMiddleware } from "../lib/auth";

const router: IRouter = Router();

function deriveWalletAddress(seedPhrase: string): string {
  const hash = crypto.createHash("sha256").update(seedPhrase).digest("hex");
  return "0x" + hash.substring(0, 40);
}

const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

async function createSession(userId: number, deviceInfo: string | undefined, res: import("express").Response): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await db.insert(sessionsTable).values({
    userId,
    tokenHash,
    deviceInfo: deviceInfo || null,
    isRevoked: false,
    expiresAt,
  });

  res.cookie("session_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });

  return token;
}

router.post("/auth/create", async (req, res): Promise<void> => {
  const { deviceInfo } = req.body || {};

  const seedPhrase = generateMnemonic(256);
  const walletAddress = deriveWalletAddress(seedPhrase);
  const seedHashValue = hashSeed(seedPhrase);

  const [user] = await db
    .insert(usersTable)
    .values({
      walletAddress,
      seedHash: seedHashValue,
      isActive: true,
    })
    .returning();

  const token = await createSession(user.id, deviceInfo, res);
  const includeToken = req.headers["x-include-token"] === "true";

  res.status(201).json({
    seedPhrase,
    walletAddress: user.walletAddress,
    userId: user.id,
    ...(includeToken ? { sessionToken: token } : {}),
  });
});

router.post("/auth/import", async (req, res): Promise<void> => {
  const { seedPhrase, deviceInfo } = req.body || {};

  if (!seedPhrase || typeof seedPhrase !== "string") {
    res.status(400).json({ error: "seedPhrase is required" });
    return;
  }

  if (!validateMnemonic(seedPhrase.trim())) {
    res.status(400).json({ error: "Invalid seed phrase" });
    return;
  }

  const trimmedSeed = seedPhrase.trim();
  const walletAddress = deriveWalletAddress(trimmedSeed);
  const seedHashValue = hashSeed(trimmedSeed);

  let [user] = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress));

  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({
        walletAddress,
        seedHash: seedHashValue,
        isActive: true,
      })
      .returning();
  } else {
    if (user.seedHash !== seedHashValue) {
      res.status(401).json({ error: "Invalid seed phrase for this wallet" });
      return;
    }
  }

  await createSession(user.id, deviceInfo, res);

  res.json({
    walletAddress: user.walletAddress,
    userId: user.id,
  });
});

router.post("/auth/restore", authMiddleware, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    walletAddress: user.walletAddress,
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  });
});

router.post("/auth/logout", authMiddleware, async (req, res): Promise<void> => {
  await db
    .update(sessionsTable)
    .set({ isRevoked: true })
    .where(eq(sessionsTable.id, req.sessionId!));

  res.clearCookie("session_token", { path: "/" });
  res.json({ success: true });
});

router.patch("/auth/profile", authMiddleware, async (req, res): Promise<void> => {
  const { displayName, avatarUrl } = req.body || {};

  const updates: Record<string, string | null> = {};
  if (typeof displayName === "string") {
    updates.displayName = displayName.trim().slice(0, 30) || null;
  }
  if (typeof avatarUrl === "string") {
    if (avatarUrl && !avatarUrl.startsWith("/api/download/")) {
      res.status(400).json({ error: "Invalid avatar URL" });
      return;
    }
    updates.avatarUrl = avatarUrl || null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.userId!))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    userId: user.id,
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  });
});

router.get("/auth/me", authMiddleware, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    userId: user.id,
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    lastSeenAt: user.lastSeenAt,
    isActive: user.isActive,
  });
});

export default router;
