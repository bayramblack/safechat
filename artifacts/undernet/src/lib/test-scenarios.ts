import type { TestCase } from "./test-runner";
import { io, type Socket } from "socket.io-client";

const BASE = "/api";

function uid(): string {
  return Math.random().toString(36).substring(2, 10);
}

function authHeaders(token: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function connectSocket(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      transports: ["websocket"],
      auth: { token },
    });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connection timeout"));
    }, 5000);
    socket.on("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Socket connect error: ${err.message}`));
    });
  });
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event);
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

export function createTestScenarios(): TestCase[] {
  const tests: TestCase[] = [];

  tests.push({
    id: "health-check",
    name: "Health Check — GET /api/healthz",
    group: "Health",
    fn: async (ctx) => {
      const res = await ctx.fetch(`${BASE}/healthz`);
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.status, "ok", "Health status");
      ctx.log("success", 'Server returned status: "ok"');
    },
  });

  tests.push({
    id: "auth-create-a",
    name: "Create User A — POST /api/auth/create",
    group: "Auth",
    fn: async (ctx) => {
      const res = await ctx.fetch(`${BASE}/auth/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Include-Token": "true" },
        body: JSON.stringify({ deviceInfo: `test-a-${uid()}` }),
      });
      ctx.assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      ctx.assertExists(data.seedPhrase, "seedPhrase");
      ctx.assertExists(data.walletAddress, "walletAddress");
      ctx.assertExists(data.userId, "userId");
      ctx.assertExists(data.sessionToken, "sessionToken in response");

      ctx.store.userA = {
        userId: data.userId,
        walletAddress: data.walletAddress,
        seedPhrase: data.seedPhrase,
        token: data.sessionToken,
      };
      ctx.log("info", `User A created: id=${data.userId} addr=${data.walletAddress.slice(0, 10)}...`);
    },
  });

  tests.push({
    id: "auth-me-a",
    name: "Verify User A Session — GET /api/auth/me",
    group: "Auth",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { userId: number; token: string };
      const res = await ctx.fetch(`${BASE}/auth/me`, {
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.userId, userA.userId, "userId match");
      ctx.log("success", `Session valid for user ${data.userId}`);
    },
  });

  tests.push({
    id: "auth-create-b",
    name: "Create User B — POST /api/auth/create",
    group: "Auth",
    fn: async (ctx) => {
      const res = await ctx.fetch(`${BASE}/auth/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Include-Token": "true" },
        body: JSON.stringify({ deviceInfo: `test-b-${uid()}` }),
      });
      ctx.assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      ctx.assertExists(data.userId, "userId");
      ctx.assertExists(data.sessionToken, "sessionToken in response");

      ctx.store.userB = {
        userId: data.userId,
        walletAddress: data.walletAddress,
        seedPhrase: data.seedPhrase,
        token: data.sessionToken,
      };
      ctx.log("info", `User B created: id=${data.userId} addr=${data.walletAddress.slice(0, 10)}...`);
    },
  });

  tests.push({
    id: "auth-me-b",
    name: "Verify User B Session — GET /api/auth/me",
    group: "Auth",
    fn: async (ctx) => {
      const userB = ctx.store.userB as { userId: number; token: string };
      const res = await ctx.fetch(`${BASE}/auth/me`, {
        headers: authHeaders(userB.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.userId, userB.userId, "userId match");
    },
  });

  tests.push({
    id: "conv-create",
    name: "Create Conversation A→B — POST /api/conversations",
    group: "Conversations",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const userB = ctx.store.userB as { walletAddress: string };
      const res = await ctx.fetch(`${BASE}/conversations`, {
        method: "POST",
        headers: authHeaders(userA.token, true),
        body: JSON.stringify({ walletAddress: userB.walletAddress }),
      });
      ctx.assert(res.status === 201 || res.ok, `Expected 200/201, got ${res.status}`);
      const data = await res.json();
      ctx.assertExists(data.id, "conversation id");
      ctx.store.conversationId = data.id;
      ctx.log("info", `Conversation created: id=${data.id}`);
    },
  });

  tests.push({
    id: "conv-duplicate",
    name: "Duplicate Conversation returns same ID",
    group: "Conversations",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const userB = ctx.store.userB as { walletAddress: string };
      const existingId = ctx.store.conversationId as number;
      const res = await ctx.fetch(`${BASE}/conversations`, {
        method: "POST",
        headers: authHeaders(userA.token, true),
        body: JSON.stringify({ walletAddress: userB.walletAddress }),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.id, existingId, "Same conversation ID");
      ctx.log("success", `Returned existing conversation id=${data.id}`);
    },
  });

  tests.push({
    id: "conv-list-a",
    name: "User A lists conversations — GET /api/conversations",
    group: "Conversations",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const convId = ctx.store.conversationId as number;
      const res = await ctx.fetch(`${BASE}/conversations`, {
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assert(Array.isArray(data), "Response is array");
      const found = data.find((c: { id: number }) => c.id === convId);
      ctx.assertExists(found, `Conversation ${convId} in list`);
      ctx.log("success", `User A sees ${data.length} conversation(s)`);
    },
  });

  tests.push({
    id: "conv-list-b",
    name: "User B lists conversations — GET /api/conversations",
    group: "Conversations",
    fn: async (ctx) => {
      const userB = ctx.store.userB as { token: string };
      const convId = ctx.store.conversationId as number;
      const res = await ctx.fetch(`${BASE}/conversations`, {
        headers: authHeaders(userB.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      const found = data.find((c: { id: number }) => c.id === convId);
      ctx.assertExists(found, `Conversation ${convId} in list`);
      ctx.log("success", `User B sees ${data.length} conversation(s)`);
    },
  });

  tests.push({
    id: "conv-detail",
    name: "Get Conversation detail — GET /api/conversations/:id",
    group: "Conversations",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const convId = ctx.store.conversationId as number;
      const res = await ctx.fetch(`${BASE}/conversations/${convId}`, {
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.id, convId, "Conversation ID");
      ctx.assertExists(data.otherUser, "otherUser present");
      ctx.log("success", `Conversation detail: type=${data.type}, otherUser=${data.otherUser?.walletAddress?.slice(0, 10)}...`);
    },
  });

  tests.push({
    id: "msg-send",
    name: "User A sends message via REST — POST /api/conversations/:id/messages",
    group: "Messages",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string; userId: number };
      const convId = ctx.store.conversationId as number;
      const clientMsgId = `test-msg-${uid()}`;
      const textContent = `Hello from test ${uid()}`;
      const res = await ctx.fetch(`${BASE}/conversations/${convId}/messages`, {
        method: "POST",
        headers: authHeaders(userA.token, true),
        body: JSON.stringify({ type: "text", textContent, clientMessageId: clientMsgId }),
      });
      ctx.assert(res.status === 201, `Expected 201, got ${res.status}`);
      const data = await res.json();
      ctx.assertExists(data.id, "message id");
      ctx.assertEqual(data.senderId, userA.userId, "sender is User A");
      ctx.assertEqual(data.textContent, textContent, "text content matches");
      ctx.store.messageId = data.id;
      ctx.store.messageText = textContent;
      ctx.log("info", `Message sent: id=${data.id} text="${textContent}"`);
    },
  });

  tests.push({
    id: "msg-receive",
    name: "User B receives message — GET /api/conversations/:id/messages",
    group: "Messages",
    fn: async (ctx) => {
      const userB = ctx.store.userB as { token: string };
      const convId = ctx.store.conversationId as number;
      const msgId = ctx.store.messageId as number;
      const msgText = ctx.store.messageText as string;
      const res = await ctx.fetch(`${BASE}/conversations/${convId}/messages`, {
        headers: authHeaders(userB.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assert(Array.isArray(data.messages), "messages is array");
      const found = data.messages.find((m: { id: number }) => m.id === msgId);
      ctx.assertExists(found, `Message ${msgId} in list`);
      ctx.assertEqual(found.textContent, msgText, "text content matches");
      ctx.log("success", `User B sees message id=${msgId}`);
    },
  });

  tests.push({
    id: "msg-delivered",
    name: "Mark message delivered — PATCH /api/messages/:id/delivered",
    group: "Messages",
    fn: async (ctx) => {
      const userB = ctx.store.userB as { token: string };
      const msgId = ctx.store.messageId as number;
      const res = await ctx.fetch(`${BASE}/messages/${msgId}/delivered`, {
        method: "PATCH",
        headers: authHeaders(userB.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.status, "delivered", "status is delivered");
      ctx.assertExists(data.deliveredAt, "deliveredAt set");
      ctx.log("success", `Message ${msgId} marked as delivered`);
    },
  });

  tests.push({
    id: "msg-read",
    name: "Mark message read — PATCH /api/messages/:id/read",
    group: "Messages",
    fn: async (ctx) => {
      const userB = ctx.store.userB as { token: string };
      const msgId = ctx.store.messageId as number;
      const res = await ctx.fetch(`${BASE}/messages/${msgId}/read`, {
        method: "PATCH",
        headers: authHeaders(userB.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.status, "read", "status is read");
      ctx.assertExists(data.readAt, "readAt set");
      ctx.log("success", `Message ${msgId} marked as read`);
    },
  });

  tests.push({
    id: "sync-messages",
    name: "Sync messages — GET /api/sync/messages",
    group: "Sync",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const since = Date.now() - 60000;
      const res = await ctx.fetch(`${BASE}/sync/messages?since=${since}`, {
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assert(Array.isArray(data.messages), "messages is array");
      ctx.log("info", `Synced ${data.messages.length} message(s)`);
    },
  });

  tests.push({
    id: "sync-conversations",
    name: "Sync conversations — GET /api/sync/conversations",
    group: "Sync",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const since = Date.now() - 60000;
      const res = await ctx.fetch(`${BASE}/sync/conversations?since=${since}`, {
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assert(Array.isArray(data.conversations), "conversations is array");
      ctx.log("info", `Synced ${data.conversations.length} conversation(s)`);
    },
  });

  tests.push({
    id: "sync-status",
    name: "Sync status — GET /api/sync/status",
    group: "Sync",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const since = Date.now() - 60000;
      const res = await ctx.fetch(`${BASE}/sync/status?since=${since}`, {
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assert(Array.isArray(data.statusUpdates), "statusUpdates is array");
      ctx.log("info", `Synced ${data.statusUpdates.length} status update(s)`);
    },
  });

  tests.push({
    id: "notif-status",
    name: "Notification status — GET /api/notifications/status",
    group: "Notifications",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const res = await ctx.fetch(`${BASE}/notifications/status`, {
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertType(data.hasActiveSubscription, "boolean", "hasActiveSubscription");
      ctx.assertType(data.subscriptionCount, "number", "subscriptionCount");
      ctx.log("info", `Notification status: subscriptions=${data.subscriptionCount}, vapidKey=${data.vapidPublicKey ? "present" : "missing"}`);
    },
  });

  tests.push({
    id: "auth-restore",
    name: "Auth restore — POST /api/auth/restore",
    group: "Auth",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string; userId: number };
      const res = await ctx.fetch(`${BASE}/auth/restore`, {
        method: "POST",
        headers: authHeaders(userA.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.userId, userA.userId, "userId matches");
      ctx.log("success", `Restored user ${data.userId}`);
    },
  });

  tests.push({
    id: "ws-connect",
    name: "Socket.io connection — Both users connect",
    group: "WebSocket",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string };
      const userB = ctx.store.userB as { token: string };
      ctx.log("socket", "Connecting User B socket first...");
      const socketB = await connectSocket(userB.token);
      ctx.log("socket", `User B connected: ${socketB.id}`);

      const onlinePromise = waitForEvent<{ userId: number }>(socketB, "user_online", 5000);
      ctx.log("socket", "Connecting User A socket...");
      const socketA = await connectSocket(userA.token);
      ctx.log("socket", `User A connected: ${socketA.id}`);

      const onlineData = await onlinePromise;
      const userAData = ctx.store.userA as { userId: number };
      ctx.assertEqual(onlineData.userId, userAData.userId, "user_online userId matches User A");
      ctx.log("success", "User B received user_online for User A");

      ctx.store.socketA = socketA;
      ctx.store.socketB = socketB;
      ctx.assert(socketA.connected, "Socket A connected");
      ctx.assert(socketB.connected, "Socket B connected");
    },
  });

  tests.push({
    id: "ws-presence-offline",
    name: "Presence — user_offline event on disconnect",
    group: "WebSocket",
    fn: async (ctx) => {
      const userA = ctx.store.userA as { token: string; userId: number };
      const socketA = ctx.store.socketA as Socket;
      const socketB = ctx.store.socketB as Socket;

      const offlinePromise = waitForEvent<{ userId: number }>(socketB, "user_offline", 5000);
      ctx.log("socket", "Disconnecting User A socket to trigger user_offline...");
      socketA.disconnect();

      const offlineData = await offlinePromise;
      ctx.assertEqual(offlineData.userId, userA.userId, "user_offline userId matches User A");
      ctx.log("success", "User B received user_offline for User A");

      ctx.log("socket", "Reconnecting User A socket...");
      const newSocketA = await connectSocket(userA.token);
      ctx.store.socketA = newSocketA;
      ctx.log("socket", `User A reconnected: ${newSocketA.id}`);
    },
  });

  tests.push({
    id: "ws-room-join",
    name: "Join conversation room",
    group: "WebSocket",
    fn: async (ctx) => {
      const socketA = ctx.store.socketA as Socket;
      const convId = ctx.store.conversationId as number;
      socketA.emit("join_conversation", convId);
      ctx.log("socket", `User A joined room conversation:${convId}`);
      await new Promise((r) => setTimeout(r, 300));
      ctx.log("success", "Room joined successfully");
    },
  });

  tests.push({
    id: "ws-realtime-msg",
    name: "Real-time message delivery via Socket",
    group: "WebSocket",
    fn: async (ctx) => {
      const socketA = ctx.store.socketA as Socket;
      const socketB = ctx.store.socketB as Socket;
      const convId = ctx.store.conversationId as number;

      const msgPromise = waitForEvent<{
        id: number;
        textContent: string;
        conversationId: number;
      }>(socketB, "new_message", 5000);

      const testText = `realtime-test-${uid()}`;
      ctx.log("socket", `User A sending message: "${testText}"`);

      socketA.emit("new_message", {
        conversationId: convId,
        clientMessageId: `ws-test-${uid()}`,
        type: "text",
        textContent: testText,
      });

      const received = await msgPromise;
      ctx.assertEqual(received.textContent, testText, "Message text matches");
      ctx.assertEqual(received.conversationId, convId, "Conversation ID matches");
      ctx.log("success", `User B received message in real-time: id=${received.id}`);
    },
  });

  tests.push({
    id: "ws-typing",
    name: "Typing indicators",
    group: "WebSocket",
    fn: async (ctx) => {
      const socketA = ctx.store.socketA as Socket;
      const socketB = ctx.store.socketB as Socket;
      const convId = ctx.store.conversationId as number;

      socketB.emit("join_conversation", convId);
      await new Promise((r) => setTimeout(r, 300));

      const typingPromise = waitForEvent<{ conversationId: number; userId: number }>(
        socketB,
        "typing_start",
        3000,
      );
      ctx.log("socket", "User A starts typing...");
      socketA.emit("typing_start", { conversationId: convId });
      const typingData = await typingPromise;
      ctx.assertEqual(typingData.conversationId, convId, "typing conversationId");
      ctx.log("success", "User B received typing_start");

      const stopPromise = waitForEvent<{ conversationId: number }>(
        socketB,
        "typing_stop",
        3000,
      );
      socketA.emit("typing_stop", { conversationId: convId });
      await stopPromise;
      ctx.log("success", "User B received typing_stop");
    },
  });

  tests.push({
    id: "ws-call-signaling",
    name: "Call signaling — initiate and reject",
    group: "WebSocket",
    fn: async (ctx) => {
      const socketA = ctx.store.socketA as Socket;
      const socketB = ctx.store.socketB as Socket;
      const convId = ctx.store.conversationId as number;
      const userB = ctx.store.userB as { userId: number };

      const callPromise = waitForEvent<{
        callSessionId: number;
        callerId: number;
        conversationId: number;
      }>(socketB, "call_initiate", 5000);

      ctx.log("socket", "User A initiating call...");
      socketA.emit("call_initiate", { conversationId: convId, receiverId: userB.userId });

      const callData = await callPromise;
      ctx.assertExists(callData.callSessionId, "callSessionId exists");
      ctx.assertEqual(callData.conversationId, convId, "call conversationId");
      ctx.log("success", `User B received call_initiate: session=${callData.callSessionId}`);

      const rejectPromise = waitForEvent<{ callSessionId: number }>(
        socketA,
        "call_reject",
        5000,
      );
      ctx.log("socket", "User B rejecting call...");
      socketB.emit("call_reject", { callSessionId: callData.callSessionId });

      const rejectData = await rejectPromise;
      ctx.assertEqual(rejectData.callSessionId, callData.callSessionId, "reject callSessionId");
      ctx.log("success", "User A received call_reject");
    },
  });

  tests.push({
    id: "ws-cleanup",
    name: "Disconnect test sockets",
    group: "WebSocket",
    fn: async (ctx) => {
      const socketA = ctx.store.socketA as Socket | undefined;
      const socketB = ctx.store.socketB as Socket | undefined;
      if (socketA) { socketA.disconnect(); ctx.log("socket", "Socket A disconnected"); }
      if (socketB) { socketB.disconnect(); ctx.log("socket", "Socket B disconnected"); }
      ctx.store.socketA = undefined;
      ctx.store.socketB = undefined;
    },
  });

  tests.push({
    id: "auth-logout",
    name: "Logout User B — POST /api/auth/logout",
    group: "Auth",
    fn: async (ctx) => {
      const userB = ctx.store.userB as { token: string };
      const res = await ctx.fetch(`${BASE}/auth/logout`, {
        method: "POST",
        headers: authHeaders(userB.token),
      });
      ctx.assert(res.ok, `Expected 200, got ${res.status}`);
      const data = await res.json();
      ctx.assertEqual(data.success, true, "logout success");
      ctx.log("success", "User B logged out");
    },
  });

  tests.push({
    id: "auth-logout-verify",
    name: "Verify logout — GET /api/auth/me returns 401",
    group: "Auth",
    fn: async (ctx) => {
      const userB = ctx.store.userB as { token: string };
      const res = await ctx.fetch(`${BASE}/auth/me`, {
        headers: authHeaders(userB.token),
      });
      ctx.assertEqual(res.status, 401, "Expected 401 after logout");
      ctx.log("success", "Session correctly invalidated after logout");
    },
  });

  return tests;
}
