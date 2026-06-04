import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { db, sessionsTable, usersTable, conversationsTable, messagesTable, attachmentsTable, callSessionsTable } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { hashToken } from "./auth";
import { logger } from "./logger";
import { sendPushNotification } from "./notifications";

interface AuthenticatedSocket extends Socket {
  data: {
    userId: number;
    walletAddress: string;
  };
}

interface SendMessagePayload {
  conversationId: number;
  clientMessageId: string;
  type?: "text" | "image" | "file" | "voice" | "video" | "system";
  textContent?: string | null;
  attachmentId?: number | null;
  duration?: number | null;
  subtype?: string | null;
}

interface ConversationPayload {
  conversationId: number;
}

interface MessageStatusPayload {
  messageId: number;
  conversationId: number;
}

interface SdpPayload {
  type: string;
  sdp?: string;
}

interface IceCandidateData {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

interface CallInitiatePayload {
  conversationId: number;
  receiverId: number;
  offer?: SdpPayload;
  callType?: "voice" | "video";
}

interface VideoTogglePayload {
  callSessionId: number;
  targetUserId: number;
}

interface CallSessionPayload {
  callSessionId: number;
  answer?: SdpPayload;
}

interface CallSessionIdPayload {
  callSessionId: number;
}

interface IceCandidatePayload {
  callSessionId: number;
  targetUserId: number;
  candidate: IceCandidateData;
}

interface CallOfferPayload {
  callSessionId: number;
  targetUserId: number;
  offer: SdpPayload;
}

interface CallAnswerPayload {
  callSessionId: number;
  targetUserId: number;
  answer: SdpPayload;
}

interface PresencePayload {
  status: string;
}

const onlineUsers = new Map<number, Set<string>>();
const callTypeMap = new Map<number, "voice" | "video">();

export function getOnlineUsers(): Map<number, Set<string>> {
  return onlineUsers;
}

export function isUserOnline(userId: number): boolean {
  const sockets = onlineUsers.get(userId);
  return !!sockets && sockets.size > 0;
}

async function verifyConversationMembership(userId: number, conversationId: number): Promise<boolean> {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        or(
          eq(conversationsTable.participantA, userId),
          eq(conversationsTable.participantB, userId),
        ),
      ),
    );
  return !!conv;
}

async function verifyCallParticipant(userId: number, callSessionId: number): Promise<{ callerId: number; receiverId: number; conversationId: number } | null> {
  const [callSession] = await db
    .select()
    .from(callSessionsTable)
    .where(
      and(
        eq(callSessionsTable.id, callSessionId),
        or(
          eq(callSessionsTable.callerId, userId),
          eq(callSessionsTable.receiverId, userId),
        ),
      ),
    );
  if (!callSession) return null;
  return { callerId: callSession.callerId, receiverId: callSession.receiverId, conversationId: callSession.conversationId };
}

async function insertCallSystemMessage(
  io: Server,
  conversationId: number,
  senderId: number,
  subtype: string,
  durationSeconds?: number,
): Promise<void> {
  try {
    let textContent = "";
    switch (subtype) {
      case "call_ended":
        textContent = durationSeconds
          ? `Voice call ended (${formatCallDuration(durationSeconds)})`
          : "Voice call ended";
        break;
      case "video_call_ended":
        textContent = durationSeconds
          ? `Video call ended (${formatCallDuration(durationSeconds)})`
          : "Video call ended";
        break;
      case "missed_call":
        textContent = "Missed voice call";
        break;
      case "missed_video_call":
        textContent = "Missed video call";
        break;
      case "call_rejected":
        textContent = "Call rejected";
        break;
      case "call_cancelled":
        textContent = "Call cancelled";
        break;
      case "call_upgraded_to_video":
        textContent = "Call upgraded to video";
        break;
      default:
        textContent = "Call event";
    }

    const clientMessageId = `sys-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const [message] = await db
      .insert(messagesTable)
      .values({
        clientMessageId,
        conversationId,
        senderId,
        type: "system",
        subtype,
        textContent,
        duration: durationSeconds ? Math.round(durationSeconds) : null,
        status: "sent",
      })
      .returning();

    await db
      .update(conversationsTable)
      .set({ lastMessageId: message.id, updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));

    const systemMsg = {
      id: message.id,
      clientMessageId: message.clientMessageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      type: message.type,
      subtype: message.subtype,
      textContent: message.textContent,
      duration: message.duration,
      status: message.status,
      createdAt: message.createdAt,
    };

    io.to(`conversation:${conversationId}`).emit("new_message", systemMsg);

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId));
    if (conv) {
      const participants = [conv.participantA, conv.participantB];
      for (const uid of participants) {
        const sockets = onlineUsers.get(uid);
        if (sockets) {
          sockets.forEach((socketId) => {
            const s = io.sockets.sockets.get(socketId);
            if (s && !s.rooms.has(`conversation:${conversationId}`)) {
              s.emit("new_message", systemMsg);
            }
          });
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to insert call system message");
  }
}

function formatCallDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

async function notifyPeers(io: Server, userId: number, event: string, payload: Record<string, unknown>): Promise<void> {
  const conversations = await db
    .select({ participantA: conversationsTable.participantA, participantB: conversationsTable.participantB })
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.participantA, userId),
        eq(conversationsTable.participantB, userId),
      ),
    );

  const peerIds = new Set<number>();
  for (const conv of conversations) {
    if (conv.participantA !== userId) peerIds.add(conv.participantA);
    if (conv.participantB !== userId) peerIds.add(conv.participantB);
  }

  for (const peerId of peerIds) {
    const peerSockets = onlineUsers.get(peerId);
    if (peerSockets) {
      peerSockets.forEach((socketId) => {
        io.to(socketId).emit(event, payload);
      });
    }
  }
}

export function setupWebSocket(httpServer: HttpServer): Server {
  const corsOrigin = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
    : true;

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    path: "/api/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        parseCookieToken(socket.handshake.headers.cookie);

      if (!token || typeof token !== "string") {
        return next(new Error("Authentication required"));
      }

      const tokenHash = hashToken(token);
      const [session] = await db
        .select()
        .from(sessionsTable)
        .where(and(eq(sessionsTable.tokenHash, tokenHash), eq(sessionsTable.isRevoked, false)));

      if (!session) {
        return next(new Error("Invalid session"));
      }

      if (session.expiresAt && session.expiresAt < new Date()) {
        return next(new Error("Session expired"));
      }

      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
      if (!user || !user.isActive) {
        return next(new Error("User not found or inactive"));
      }

      socket.data.userId = user.id;
      socket.data.walletAddress = user.walletAddress;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userId = socket.data.userId;
    logger.info({ userId, socketId: socket.id }, "WebSocket connected");

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    notifyPeers(io, userId, "user_online", { userId, timestamp: new Date().toISOString() });
    db.update(usersTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(usersTable.id, userId))
      .then(() => {});

    db.select()
      .from(callSessionsTable)
      .where(and(eq(callSessionsTable.receiverId, userId), eq(callSessionsTable.status, "ringing")))
      .then(async (pendingCalls) => {
        for (const call of pendingCalls) {
          const elapsed = Date.now() - new Date(call.createdAt).getTime();
          if (elapsed < 60000) {
            const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, call.callerId));
            socket.emit("call_initiate", {
              callSessionId: call.id,
              callerId: call.callerId,
              conversationId: call.conversationId,
              callType: callTypeMap.get(call.id) || "voice",
              callerUsername: caller?.displayName || null,
              callerWalletAddress: caller?.walletAddress || "",
              callerAvatarUrl: caller?.avatarUrl || null,
            });
          }
        }
      }).catch(() => {});

    socket.on("join_conversation", async (conversationId: number) => {
      if (typeof conversationId !== "number" || !Number.isFinite(conversationId)) {
        socket.emit("error_event", { error: "Invalid conversation ID" });
        return;
      }
      const isMember = await verifyConversationMembership(userId, conversationId);
      if (!isMember) {
        socket.emit("error_event", { error: "Access denied to conversation" });
        return;
      }
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("leave_conversation", async (conversationId: number) => {
      if (typeof conversationId !== "number" || !Number.isFinite(conversationId)) return;
      const isMember = await verifyConversationMembership(userId, conversationId);
      if (!isMember) return;
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("new_message", async (data: SendMessagePayload, ack?: unknown) => {
      const sendAck = (response: { ok: true; message: unknown } | { ok: false; error: string }): void => {
        if (typeof ack === "function") {
          try {
            (ack as (r: typeof response) => void)(response);
          } catch {}
        }
      };

      if (!data?.conversationId || typeof data.conversationId !== "number") {
        sendAck({ ok: false, error: "Invalid conversation" });
        return;
      }
      if (!data?.clientMessageId || typeof data.clientMessageId !== "string") {
        sendAck({ ok: false, error: "Invalid message id" });
        return;
      }

      const [conv] = await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.id, data.conversationId),
            or(
              eq(conversationsTable.participantA, userId),
              eq(conversationsTable.participantB, userId),
            ),
          ),
        );
      if (!conv) {
        sendAck({ ok: false, error: "Conversation not found" });
        return;
      }

      const msgType = data.type || "text";
      if (msgType === "system") {
        sendAck({ ok: false, error: "Invalid message type" });
        return;
      }
      if (msgType === "text" && (!data.textContent || typeof data.textContent !== "string")) {
        sendAck({ ok: false, error: "Missing text content" });
        return;
      }
      if ((msgType === "voice" || msgType === "video") && !data.attachmentId) {
        sendAck({ ok: false, error: "Missing attachment" });
        return;
      }

      if (data.attachmentId) {
        const [attachment] = await db
          .select()
          .from(attachmentsTable)
          .where(
            and(
              eq(attachmentsTable.id, data.attachmentId),
              eq(attachmentsTable.uploadedBy, userId),
              isNull(attachmentsTable.messageId),
            ),
          );
        if (!attachment) {
          sendAck({ ok: false, error: "Attachment not found" });
          return;
        }
      }

      try {
        const [existingMsg] = await db
          .select()
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.clientMessageId, data.clientMessageId),
              eq(messagesTable.senderId, userId),
              eq(messagesTable.conversationId, data.conversationId),
            ),
          );

        if (existingMsg) {
          const dupMsg = {
            id: existingMsg.id,
            clientMessageId: existingMsg.clientMessageId,
            conversationId: existingMsg.conversationId,
            senderId: existingMsg.senderId,
            type: existingMsg.type,
            subtype: existingMsg.subtype,
            textContent: existingMsg.textContent,
            attachmentId: existingMsg.attachmentId,
            duration: existingMsg.duration,
            status: existingMsg.status,
            createdAt: existingMsg.createdAt,
          };
          socket.emit("message_saved", dupMsg);
          sendAck({ ok: true, message: dupMsg });
          return;
        }

        const [message] = await db
          .insert(messagesTable)
          .values({
            clientMessageId: data.clientMessageId,
            conversationId: data.conversationId,
            senderId: userId,
            type: msgType,
            textContent: data.textContent || null,
            attachmentId: data.attachmentId || null,
            duration: typeof data.duration === "number" ? Math.round(data.duration) : null,
            status: "sent",
          })
          .returning();

        if (data.attachmentId) {
          await db
            .update(attachmentsTable)
            .set({ messageId: message.id })
            .where(
              and(
                eq(attachmentsTable.id, data.attachmentId),
                eq(attachmentsTable.uploadedBy, userId),
                isNull(attachmentsTable.messageId),
              ),
            );
        }

        await db
          .update(conversationsTable)
          .set({ lastMessageId: message.id, updatedAt: new Date() })
          .where(eq(conversationsTable.id, data.conversationId));

        const canonicalMsg = {
          id: message.id,
          clientMessageId: message.clientMessageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          type: message.type,
          subtype: message.subtype,
          textContent: message.textContent,
          attachmentId: message.attachmentId,
          duration: message.duration,
          status: message.status,
          createdAt: message.createdAt,
        };

        socket.emit("message_saved", canonicalMsg);
        sendAck({ ok: true, message: canonicalMsg });
        socket.to(`conversation:${data.conversationId}`).emit("new_message", canonicalMsg);

        const otherUserId = conv.participantA === userId ? conv.participantB : conv.participantA;

        const otherSockets = onlineUsers.get(otherUserId);
        if (otherSockets) {
          otherSockets.forEach((socketId) => {
            const otherSocket = io.sockets.sockets.get(socketId);
            if (otherSocket && !otherSocket.rooms.has(`conversation:${data.conversationId}`)) {
              otherSocket.emit("new_message", canonicalMsg);
            }
          });
        }

        const isOtherOnline = onlineUsers.has(otherUserId) && (onlineUsers.get(otherUserId)?.size ?? 0) > 0;
        if (!isOtherOnline) {
          let pushBody = data.textContent || "You received a new message";
          if (msgType === "voice") pushBody = "🎤 Voice message";
          else if (msgType === "video") pushBody = "🎥 Video message";
          else if (msgType === "image") pushBody = "📷 Image";
          else if (msgType === "file") pushBody = "📎 File";
          sendPushNotification(otherUserId, {
            title: "New Message",
            body: pushBody,
            data: { conversationId: data.conversationId, type: "message" },
          }).catch((err) => logger.error({ err }, "Push notification failed"));
        }
      } catch (err) {
        logger.error({ err }, "Failed to save/broadcast message");
        socket.emit("error_event", { error: "Failed to send message" });
        sendAck({ ok: false, error: "Failed to send message" });
      }
    });

    socket.on("message_delivered", async (data: MessageStatusPayload) => {
      if (!data?.conversationId || typeof data.conversationId !== "number") return;
      if (!data?.messageId || typeof data.messageId !== "number") return;

      const isMember = await verifyConversationMembership(userId, data.conversationId);
      if (!isMember) return;

      const [msg] = await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.id, data.messageId),
            eq(messagesTable.conversationId, data.conversationId),
          ),
        );
      if (!msg || msg.senderId === userId) return;
      if (msg.status !== "sent") return;

      await db
        .update(messagesTable)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(eq(messagesTable.id, data.messageId));

      socket.to(`conversation:${data.conversationId}`).emit("message_delivered", {
        messageId: data.messageId,
        deliveredAt: new Date().toISOString(),
      });
    });

    socket.on("message_read", async (data: MessageStatusPayload) => {
      if (!data?.conversationId || typeof data.conversationId !== "number") return;
      if (!data?.messageId || typeof data.messageId !== "number") return;

      const isMember = await verifyConversationMembership(userId, data.conversationId);
      if (!isMember) return;

      const [msg] = await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.id, data.messageId),
            eq(messagesTable.conversationId, data.conversationId),
          ),
        );
      if (!msg || msg.senderId === userId) return;
      if (msg.status === "read") return;

      await db
        .update(messagesTable)
        .set({ status: "read", readAt: new Date() })
        .where(eq(messagesTable.id, data.messageId));

      socket.to(`conversation:${data.conversationId}`).emit("message_read", {
        messageId: data.messageId,
        readAt: new Date().toISOString(),
      });
    });

    socket.on("typing_start", async (data: ConversationPayload) => {
      if (!data?.conversationId || typeof data.conversationId !== "number") return;
      const isMember = await verifyConversationMembership(userId, data.conversationId);
      if (!isMember) return;

      socket.to(`conversation:${data.conversationId}`).emit("typing_start", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("typing_stop", async (data: ConversationPayload) => {
      if (!data?.conversationId || typeof data.conversationId !== "number") return;
      const isMember = await verifyConversationMembership(userId, data.conversationId);
      if (!isMember) return;

      socket.to(`conversation:${data.conversationId}`).emit("typing_stop", {
        userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("call_initiate", async (data: CallInitiatePayload) => {
      if (!data?.conversationId || typeof data.conversationId !== "number") return;
      if (!data?.receiverId || typeof data.receiverId !== "number") return;

      const isMember = await verifyConversationMembership(userId, data.conversationId);
      if (!isMember) {
        socket.emit("call_error", { error: "Access denied to conversation" });
        return;
      }

      const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, data.conversationId));
      if (!conv) {
        socket.emit("call_error", { error: "Conversation not found" });
        return;
      }
      const isValidReceiver = (conv.participantA === data.receiverId || conv.participantB === data.receiverId) && data.receiverId !== userId;
      if (!isValidReceiver) {
        socket.emit("call_error", { error: "Invalid call receiver" });
        return;
      }

      try {
        const callType = data.callType || "voice";

        const [callerUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        const callerUsername = callerUser?.displayName || null;
        const callerWalletAddress = callerUser?.walletAddress || "";
        const callerAvatarUrl = callerUser?.avatarUrl || null;

        const [callSession] = await db
          .insert(callSessionsTable)
          .values({
            callerId: userId,
            receiverId: data.receiverId,
            conversationId: data.conversationId,
            status: "ringing",
          })
          .returning();

        callTypeMap.set(callSession.id, callType);

        const receiverSockets = onlineUsers.get(data.receiverId);
        if (receiverSockets) {
          receiverSockets.forEach((socketId) => {
            io.to(socketId).emit("call_initiate", {
              callSessionId: callSession.id,
              callerId: userId,
              conversationId: data.conversationId,
              offer: data.offer,
              callType,
              callerUsername,
              callerWalletAddress,
              callerAvatarUrl,
            });
          });
        }

        const pushBody = callType === "video" ? "You have an incoming video call" : "You have an incoming voice call";
        sendPushNotification(data.receiverId, {
          title: callType === "video" ? "Incoming Video Call" : "Incoming Call",
          body: pushBody,
          data: { callSessionId: callSession.id, conversationId: data.conversationId, type: "call" },
        }).catch((err) => logger.error({ err }, "Call push notification failed"));

        socket.emit("call_ringing", { callSessionId: callSession.id });

        setTimeout(async () => {
          try {
            const [cs] = await db.select().from(callSessionsTable).where(eq(callSessionsTable.id, callSession.id));
            if (cs && cs.status === "ringing") {
              await db
                .update(callSessionsTable)
                .set({ status: "missed", endedAt: new Date() })
                .where(eq(callSessionsTable.id, callSession.id));

              const callerSockets = onlineUsers.get(userId);
              if (callerSockets) {
                callerSockets.forEach((sid) => {
                  io.to(sid).emit("call_end", { callSessionId: callSession.id });
                });
              }
              const receiverSockets = onlineUsers.get(data.receiverId);
              if (receiverSockets) {
                receiverSockets.forEach((sid) => {
                  io.to(sid).emit("call_end", { callSessionId: callSession.id });
                });
              }

              const missedType = callTypeMap.get(callSession.id);
              callTypeMap.delete(callSession.id);
              await insertCallSystemMessage(
                io,
                data.conversationId,
                userId,
                missedType === "video" ? "missed_video_call" : "missed_call",
              );
            }
          } catch (err) {
            logger.error({ err }, "Failed to handle call timeout");
          }
        }, 60000);
      } catch (err) {
        logger.error({ err }, "Failed to initiate call");
        socket.emit("call_error", { error: "Failed to initiate call" });
      }
    });

    socket.on("call_accept", async (data: CallSessionPayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) {
        socket.emit("call_error", { error: "Access denied" });
        return;
      }

      if (participant.receiverId !== userId) {
        socket.emit("call_error", { error: "Only the receiver can accept a call" });
        return;
      }

      try {
        const [cs] = await db.select().from(callSessionsTable).where(eq(callSessionsTable.id, data.callSessionId));
        if (!cs || cs.status !== "ringing") return;

        await db
          .update(callSessionsTable)
          .set({ status: "active", startedAt: new Date() })
          .where(and(eq(callSessionsTable.id, data.callSessionId), eq(callSessionsTable.status, "ringing")));

        const callerSockets = onlineUsers.get(participant.callerId);
        if (callerSockets) {
          callerSockets.forEach((socketId) => {
            io.to(socketId).emit("call_accept", {
              callSessionId: data.callSessionId,
              answer: data.answer,
            });
          });
        }
      } catch (err) {
        logger.error({ err }, "Failed to accept call");
      }
    });

    socket.on("call_reject", async (data: CallSessionIdPayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) return;

      try {
        const [cs] = await db.select().from(callSessionsTable).where(eq(callSessionsTable.id, data.callSessionId));
        if (!cs || cs.status !== "ringing") return;

        callTypeMap.delete(data.callSessionId);

        await db
          .update(callSessionsTable)
          .set({ status: "rejected", endedAt: new Date() })
          .where(eq(callSessionsTable.id, data.callSessionId));

        const callerSockets = onlineUsers.get(participant.callerId);
        if (callerSockets) {
          callerSockets.forEach((socketId) => {
            io.to(socketId).emit("call_reject", {
              callSessionId: data.callSessionId,
            });
          });
        }

        await insertCallSystemMessage(
          io,
          participant.conversationId,
          userId,
          "call_rejected",
        );
      } catch (err) {
        logger.error({ err }, "Failed to reject call");
      }
    });

    socket.on("call_end", async (data: CallSessionIdPayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) return;

      try {
        const [callSession] = await db
          .select()
          .from(callSessionsTable)
          .where(eq(callSessionsTable.id, data.callSessionId));

        if (!callSession || callSession.status === "ended" || callSession.status === "rejected" || callSession.status === "missed") {
          return;
        }

        const now = new Date();
        await db
          .update(callSessionsTable)
          .set({ status: "ended", endedAt: now })
          .where(eq(callSessionsTable.id, data.callSessionId));

        const otherUserId = participant.callerId === userId ? participant.receiverId : participant.callerId;
        const otherSockets = onlineUsers.get(otherUserId);
        if (otherSockets) {
          otherSockets.forEach((socketId) => {
            io.to(socketId).emit("call_end", {
              callSessionId: data.callSessionId,
            });
          });
        }

        const endCallType = callTypeMap.get(data.callSessionId);
        callTypeMap.delete(data.callSessionId);
        const isVideo = endCallType === "video";

        if (callSession.status === "ringing") {
          const isCallerEnding = userId === participant.callerId;
          await insertCallSystemMessage(
            io,
            participant.conversationId,
            userId,
            isCallerEnding ? "call_cancelled" : (isVideo ? "missed_video_call" : "missed_call"),
          );
        } else if (callSession.status === "active" && callSession.startedAt) {
          const durationSeconds = Math.round((now.getTime() - new Date(callSession.startedAt).getTime()) / 1000);
          await insertCallSystemMessage(
            io,
            participant.conversationId,
            userId,
            isVideo ? "video_call_ended" : "call_ended",
            durationSeconds,
          );
        } else {
          await insertCallSystemMessage(
            io,
            participant.conversationId,
            userId,
            isVideo ? "video_call_ended" : "call_ended",
          );
        }
      } catch (err) {
        logger.error({ err }, "Failed to end call");
      }
    });

    socket.on("ice_candidate", async (data: IceCandidatePayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;
      if (!data?.targetUserId || typeof data.targetUserId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) return;

      const isValidTarget = (participant.callerId === data.targetUserId || participant.receiverId === data.targetUserId) && data.targetUserId !== userId;
      if (!isValidTarget) return;

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        targetSockets.forEach((socketId) => {
          io.to(socketId).emit("ice_candidate", {
            callSessionId: data.callSessionId,
            candidate: data.candidate,
            fromUserId: userId,
          });
        });
      }
    });

    socket.on("call_offer", async (data: CallOfferPayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;
      if (!data?.targetUserId || typeof data.targetUserId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) return;

      const isValidTarget = (participant.callerId === data.targetUserId || participant.receiverId === data.targetUserId) && data.targetUserId !== userId;
      if (!isValidTarget) return;

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        targetSockets.forEach((socketId) => {
          io.to(socketId).emit("call_offer", {
            callSessionId: data.callSessionId,
            offer: data.offer,
            fromUserId: userId,
          });
        });
      }
    });

    socket.on("enable_video", async (data: VideoTogglePayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) return;

      const peerId = participant.callerId === userId ? participant.receiverId : participant.callerId;
      const wasVoice = callTypeMap.get(data.callSessionId) !== "video";
      callTypeMap.set(data.callSessionId, "video");

      const targetSockets = onlineUsers.get(peerId);
      if (targetSockets) {
        targetSockets.forEach((socketId) => {
          io.to(socketId).emit("enable_video", {
            callSessionId: data.callSessionId,
            fromUserId: userId,
          });
        });
      }

      if (wasVoice) {
        await insertCallSystemMessage(
          io,
          participant.conversationId,
          userId,
          "call_upgraded_to_video",
        );
      }
    });

    socket.on("disable_video", async (data: VideoTogglePayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) return;

      const peerId = participant.callerId === userId ? participant.receiverId : participant.callerId;

      callTypeMap.set(data.callSessionId, "voice");

      const targetSockets = onlineUsers.get(peerId);
      if (targetSockets) {
        targetSockets.forEach((socketId) => {
          io.to(socketId).emit("disable_video", {
            callSessionId: data.callSessionId,
            fromUserId: userId,
          });
        });
      }
    });

    socket.on("call_answer", async (data: CallAnswerPayload) => {
      if (!data?.callSessionId || typeof data.callSessionId !== "number") return;
      if (!data?.targetUserId || typeof data.targetUserId !== "number") return;

      const participant = await verifyCallParticipant(userId, data.callSessionId);
      if (!participant) return;

      const isValidTarget = (participant.callerId === data.targetUserId || participant.receiverId === data.targetUserId) && data.targetUserId !== userId;
      if (!isValidTarget) return;

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        targetSockets.forEach((socketId) => {
          io.to(socketId).emit("call_answer", {
            callSessionId: data.callSessionId,
            answer: data.answer,
            fromUserId: userId,
          });
        });
      }
    });

    socket.on("disconnect", () => {
      logger.info({ userId, socketId: socket.id }, "WebSocket disconnected");

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          notifyPeers(io, userId, "user_offline", { userId, timestamp: new Date().toISOString() });
          db.update(usersTable)
            .set({ lastSeenAt: new Date() })
            .where(eq(usersTable.id, userId))
            .then(() => {});
        }
      }
    });

    socket.on("presence_update", (data: PresencePayload) => {
      if (!data?.status || typeof data.status !== "string") return;
      notifyPeers(io, userId, "presence_update", {
        userId,
        status: data.status,
        timestamp: new Date().toISOString(),
      });
    });
  });

  return io;
}

function parseCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");
    if (name === "session_token") {
      return valueParts.join("=");
    }
  }
  return null;
}
