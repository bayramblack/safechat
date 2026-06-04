import { Router, type IRouter } from "express";
import { db, usersTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, or, and, desc } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { isUserOnline } from "../lib/websocket";

const router: IRouter = Router();

router.get("/conversations", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.participantA, userId),
        eq(conversationsTable.participantB, userId),
      ),
    )
    .orderBy(desc(conversationsTable.updatedAt));

  const results = await Promise.all(
    conversations.map(async (conv) => {
      const otherUserId = conv.participantA === userId ? conv.participantB : conv.participantA;
      const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherUserId));

      let lastMessage = null;
      if (conv.lastMessageId) {
        const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, conv.lastMessageId));
        if (msg) {
          lastMessage = {
            id: msg.id,
            type: msg.type,
            subtype: msg.subtype,
            textContent: msg.textContent,
            senderId: msg.senderId,
            createdAt: msg.createdAt,
            status: msg.status,
          };
        }
      }

      return {
        id: conv.id,
        type: conv.type,
        otherUser: otherUser
          ? {
              id: otherUser.id,
              walletAddress: otherUser.walletAddress,
              displayName: otherUser.displayName,
              avatarUrl: otherUser.avatarUrl,
              lastSeenAt: otherUser.lastSeenAt,
              isActive: otherUser.isActive,
              isOnline: isUserOnline(otherUser.id),
            }
          : null,
        lastMessage,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    }),
  );

  res.json(results);
});

router.post("/conversations", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { walletAddress } = req.body || {};

  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    res.status(400).json({ error: "Invalid wallet address format" });
    return;
  }

  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress));
  if (!otherUser) {
    res.status(404).json({ error: "User with this wallet address not found" });
    return;
  }

  if (otherUser.id === userId) {
    res.status(400).json({ error: "Cannot create conversation with yourself" });
    return;
  }

  const participantA = Math.min(userId, otherUser.id);
  const participantB = Math.max(userId, otherUser.id);

  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.participantA, participantA),
        eq(conversationsTable.participantB, participantB),
      ),
    );

  if (existing) {
    res.json({
      id: existing.id,
      type: existing.type,
      otherUser: {
        id: otherUser.id,
        walletAddress: otherUser.walletAddress,
        displayName: otherUser.displayName,
        avatarUrl: otherUser.avatarUrl,
        lastSeenAt: otherUser.lastSeenAt,
        isActive: otherUser.isActive,
        isOnline: isUserOnline(otherUser.id),
      },
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      isNew: false,
    });
    return;
  }

  try {
    const [conversation] = await db
      .insert(conversationsTable)
      .values({
        type: "direct",
        participantA,
        participantB,
      })
      .returning();

    res.status(201).json({
      id: conversation.id,
      type: conversation.type,
      otherUser: {
        id: otherUser.id,
        walletAddress: otherUser.walletAddress,
        displayName: otherUser.displayName,
        avatarUrl: otherUser.avatarUrl,
        lastSeenAt: otherUser.lastSeenAt,
        isActive: otherUser.isActive,
        isOnline: isUserOnline(otherUser.id),
      },
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      isNew: true,
    });
  } catch (err: unknown) {
    const isUniqueViolation = err instanceof Error && "code" in err && (err as { code: string }).code === "23505";
    if (isUniqueViolation) {
      const [raceExisting] = await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.participantA, participantA),
            eq(conversationsTable.participantB, participantB),
          ),
        );
      if (raceExisting) {
        res.json({
          id: raceExisting.id,
          type: raceExisting.type,
          otherUser: {
            id: otherUser.id,
            walletAddress: otherUser.walletAddress,
            displayName: otherUser.displayName,
            avatarUrl: otherUser.avatarUrl,
            lastSeenAt: otherUser.lastSeenAt,
            isActive: otherUser.isActive,
            isOnline: isUserOnline(otherUser.id),
          },
          createdAt: raceExisting.createdAt,
          updatedAt: raceExisting.updatedAt,
          isNew: false,
        });
        return;
      }
    }
    throw err;
  }
});

router.get("/conversations/:id", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const convId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(convId)) {
    res.status(400).json({ error: "Invalid conversation ID" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, convId));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conversation.participantA !== userId && conversation.participantB !== userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const otherUserId = conversation.participantA === userId ? conversation.participantB : conversation.participantA;
  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherUserId));

  res.json({
    id: conversation.id,
    type: conversation.type,
    otherUser: otherUser
      ? {
          id: otherUser.id,
          walletAddress: otherUser.walletAddress,
          displayName: otherUser.displayName,
          avatarUrl: otherUser.avatarUrl,
          lastSeenAt: otherUser.lastSeenAt,
          isActive: otherUser.isActive,
          isOnline: isUserOnline(otherUser.id),
        }
      : null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });
});

export default router;
