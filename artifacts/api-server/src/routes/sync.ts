import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { eq, or, and, gt, desc } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";

const router: IRouter = Router();

function parseSinceParam(raw: unknown): Date | null {
  if (!raw || typeof raw !== "string") return new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ts = parseInt(raw, 10);
  if (isNaN(ts) || ts < 0 || !isFinite(ts)) return null;
  const date = new Date(ts);
  if (isNaN(date.getTime())) return null;
  return date;
}

router.get("/sync/messages", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const since = parseSinceParam(req.query.since);

  if (!since) {
    res.status(400).json({ error: "Invalid 'since' timestamp" });
    return;
  }

  const conversations = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.participantA, userId),
        eq(conversationsTable.participantB, userId),
      ),
    );

  const convIds = conversations.map((c) => c.id);

  if (convIds.length === 0) {
    res.json({ messages: [] });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        gt(messagesTable.createdAt, since),
        or(...convIds.map((id) => eq(messagesTable.conversationId, id))),
      ),
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(500);

  res.json({
    messages: messages.map((msg) => ({
      id: msg.id,
      clientMessageId: msg.clientMessageId,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      type: msg.type,
      subtype: msg.subtype,
      textContent: msg.textContent,
      attachmentId: msg.attachmentId,
      status: msg.status,
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
    })),
  });
});

router.get("/sync/conversations", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const since = parseSinceParam(req.query.since);

  if (!since) {
    res.status(400).json({ error: "Invalid 'since' timestamp" });
    return;
  }

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        or(
          eq(conversationsTable.participantA, userId),
          eq(conversationsTable.participantB, userId),
        ),
        gt(conversationsTable.updatedAt, since),
      ),
    )
    .orderBy(desc(conversationsTable.updatedAt));

  res.json({
    conversations: conversations.map((conv) => ({
      id: conv.id,
      type: conv.type,
      participantA: conv.participantA,
      participantB: conv.participantB,
      lastMessageId: conv.lastMessageId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    })),
  });
});

router.get("/sync/status", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const since = parseSinceParam(req.query.since);

  if (!since) {
    res.status(400).json({ error: "Invalid 'since' timestamp" });
    return;
  }

  const conversations = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.participantA, userId),
        eq(conversationsTable.participantB, userId),
      ),
    );

  const convIds = conversations.map((c) => c.id);

  if (convIds.length === 0) {
    res.json({ statusUpdates: [] });
    return;
  }

  const messages = await db
    .select({
      id: messagesTable.id,
      conversationId: messagesTable.conversationId,
      status: messagesTable.status,
      deliveredAt: messagesTable.deliveredAt,
      readAt: messagesTable.readAt,
    })
    .from(messagesTable)
    .where(
      and(
        or(...convIds.map((id) => eq(messagesTable.conversationId, id))),
        or(
          gt(messagesTable.deliveredAt, since),
          gt(messagesTable.readAt, since),
        ),
      ),
    )
    .orderBy(desc(messagesTable.id))
    .limit(500);

  res.json({
    statusUpdates: messages,
  });
});

export default router;
