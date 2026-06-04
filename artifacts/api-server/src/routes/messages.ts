import { Router, type IRouter } from "express";
import { db, conversationsTable, messagesTable, attachmentsTable } from "@workspace/db";
import { eq, and, or, lt, desc, isNull } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { sendPushNotification } from "../lib/notifications";
import { isUserOnline } from "../lib/websocket";

const router: IRouter = Router();

router.get("/conversations/:id/messages", authMiddleware, async (req, res): Promise<void> => {
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

  const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : undefined;
  if (cursor !== undefined && isNaN(cursor)) {
    res.status(400).json({ error: "Invalid cursor value" });
    return;
  }
  const parsedLimit = parseInt((req.query.limit as string) || "50", 10);
  const limit = Math.min(isNaN(parsedLimit) ? 50 : parsedLimit, 100);

  const conditions = [eq(messagesTable.conversationId, convId)];
  if (cursor) {
    conditions.push(lt(messagesTable.id, cursor));
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(and(...conditions))
    .orderBy(desc(messagesTable.id))
    .limit(limit + 1);

  const hasMore = messages.length > limit;
  const resultMessages = hasMore ? messages.slice(0, limit) : messages;

  const messagesWithAttachments = await Promise.all(
    resultMessages.map(async (msg) => {
      let attachment = null;
      if (msg.attachmentId) {
        const [att] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, msg.attachmentId));
        if (att) {
          attachment = {
            id: att.id,
            originalName: att.originalName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            storageKey: att.storageKey,
          };
        }
      }
      return {
        id: msg.id,
        clientMessageId: msg.clientMessageId,
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        type: msg.type,
        subtype: msg.subtype,
        textContent: msg.textContent,
        attachment,
        status: msg.status,
        duration: msg.duration,
        deliveredAt: msg.deliveredAt,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
      };
    }),
  );

  res.json({
    messages: messagesWithAttachments,
    nextCursor: hasMore ? resultMessages[resultMessages.length - 1].id : null,
    hasMore,
  });
});

router.post("/conversations/:id/messages", authMiddleware, async (req, res): Promise<void> => {
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

  const { type = "text", textContent, clientMessageId, attachmentId } = req.body || {};

  if (!clientMessageId || typeof clientMessageId !== "string") {
    res.status(400).json({ error: "clientMessageId is required" });
    return;
  }

  const validTypes = ["text", "image", "file", "voice", "video"] as const;
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid message type. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  if (type === "text" && (!textContent || typeof textContent !== "string" || textContent.trim().length === 0)) {
    res.status(400).json({ error: "textContent is required for text messages" });
    return;
  }

  if ((type === "image" || type === "file" || type === "voice" || type === "video") && !attachmentId) {
    res.status(400).json({ error: "attachmentId is required for image/file/voice/video messages" });
    return;
  }

  const { duration } = req.body || {};

  if (attachmentId) {
    const [attachment] = await db
      .select()
      .from(attachmentsTable)
      .where(
        and(
          eq(attachmentsTable.id, attachmentId),
          eq(attachmentsTable.uploadedBy, userId),
          isNull(attachmentsTable.messageId),
        ),
      );

    if (!attachment) {
      res.status(403).json({ error: "Attachment not found, not owned by you, or already used" });
      return;
    }
  }

  const [existingMsg] = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.clientMessageId, clientMessageId),
        eq(messagesTable.senderId, userId),
        eq(messagesTable.conversationId, convId),
      ),
    );

  if (existingMsg) {
    res.json({
      id: existingMsg.id,
      clientMessageId: existingMsg.clientMessageId,
      conversationId: existingMsg.conversationId,
      senderId: existingMsg.senderId,
      type: existingMsg.type,
      textContent: existingMsg.textContent,
      attachmentId: existingMsg.attachmentId,
      status: existingMsg.status,
      createdAt: existingMsg.createdAt,
    });
    return;
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      clientMessageId,
      conversationId: convId,
      senderId: userId,
      type: type as "text" | "image" | "file" | "voice" | "video",
      textContent: textContent || null,
      attachmentId: attachmentId || null,
      duration: typeof duration === "number" ? Math.round(duration) : null,
      status: "sent",
    })
    .returning();

  if (attachmentId) {
    await db
      .update(attachmentsTable)
      .set({ messageId: message.id })
      .where(
        and(
          eq(attachmentsTable.id, attachmentId),
          eq(attachmentsTable.uploadedBy, userId),
          isNull(attachmentsTable.messageId),
        ),
      );
  }

  await db
    .update(conversationsTable)
    .set({ lastMessageId: message.id, updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId));

  const otherUserId = conversation.participantA === userId ? conversation.participantB : conversation.participantA;
  if (!isUserOnline(otherUserId)) {
    let pushBody = textContent || "You received a new message";
    if (type === "voice") pushBody = "🎤 Voice message";
    else if (type === "video") pushBody = "🎥 Video message";
    else if (type === "image") pushBody = "📷 Image";
    else if (type === "file") pushBody = "📎 File";
    sendPushNotification(otherUserId, {
      title: "New Message",
      body: pushBody,
      data: { conversationId: convId, messageId: message.id, type: "message" },
    }).catch((err) => req.log.error({ err }, "Failed to send push notification"));
  }

  res.status(201).json({
    id: message.id,
    clientMessageId: message.clientMessageId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    textContent: message.textContent,
    attachmentId: message.attachmentId,
    duration: message.duration,
    status: message.status,
    createdAt: message.createdAt,
  });
});

router.patch("/messages/:id/delivered", authMiddleware, async (req, res): Promise<void> => {
  const msgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(msgId)) {
    res.status(400).json({ error: "Invalid message ID" });
    return;
  }

  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, message.conversationId));

  if (!conversation || (conversation.participantA !== req.userId! && conversation.participantB !== req.userId!)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (message.senderId === req.userId!) {
    res.status(400).json({ error: "Cannot mark your own message as delivered" });
    return;
  }

  if (message.status !== "sent") {
    res.status(400).json({ error: "Message is already delivered or read" });
    return;
  }

  const [updated] = await db
    .update(messagesTable)
    .set({ status: "delivered", deliveredAt: new Date() })
    .where(eq(messagesTable.id, msgId))
    .returning();

  res.json({
    id: updated.id,
    status: updated.status,
    deliveredAt: updated.deliveredAt,
  });
});

router.patch("/messages/:id/read", authMiddleware, async (req, res): Promise<void> => {
  const msgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(msgId)) {
    res.status(400).json({ error: "Invalid message ID" });
    return;
  }

  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, message.conversationId));

  if (!conversation || (conversation.participantA !== req.userId! && conversation.participantB !== req.userId!)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (message.senderId === req.userId!) {
    res.status(400).json({ error: "Cannot mark your own message as read" });
    return;
  }

  if (message.status === "read") {
    res.status(400).json({ error: "Message is already marked as read" });
    return;
  }

  const [updated] = await db
    .update(messagesTable)
    .set({ status: "read", readAt: new Date() })
    .where(eq(messagesTable.id, msgId))
    .returning();

  res.json({
    id: updated.id,
    status: updated.status,
    readAt: updated.readAt,
  });
});

export default router;
