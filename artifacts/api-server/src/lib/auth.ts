import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashSeed(seed: string): string {
  return crypto.createHash("sha256").update(seed).digest("hex");
}

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      sessionId?: number;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }
  if (!token) {
    token = req.cookies?.session_token;
  }
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tokenHash = hashToken(token);
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.tokenHash, tokenHash), eq(sessionsTable.isRevoked, false)));

  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  if (session.expiresAt && session.expiresAt < new Date()) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  await db.update(usersTable).set({ lastSeenAt: new Date() }).where(eq(usersTable.id, user.id));

  const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
  const RENEWAL_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
  if (session.expiresAt) {
    const timeRemaining = session.expiresAt.getTime() - Date.now();
    if (timeRemaining < RENEWAL_THRESHOLD_MS) {
      const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
      await db.update(sessionsTable).set({ expiresAt: newExpiry }).where(eq(sessionsTable.id, session.id));
      res.cookie("session_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_TTL_MS,
        path: "/",
      });
    }
  }

  req.userId = user.id;
  req.sessionId = session.id;
  next();
}
