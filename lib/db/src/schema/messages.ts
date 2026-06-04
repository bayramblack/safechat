import { pgTable, serial, integer, text, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "file", "voice", "video", "system"]);
export const messageStatusEnum = pgEnum("message_status", ["sent", "delivered", "read"]);

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  clientMessageId: text("client_message_id").notNull(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: messageTypeEnum("type").notNull().default("text"),
  textContent: text("text_content"),
  attachmentId: integer("attachment_id"),
  status: messageStatusEnum("status").notNull().default("sent"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  duration: integer("duration"),
  subtype: text("subtype"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("messages_sender_conv_client_id").on(table.senderId, table.conversationId, table.clientMessageId),
]);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
