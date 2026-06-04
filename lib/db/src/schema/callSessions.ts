import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

export const callStatusEnum = pgEnum("call_status", ["ringing", "active", "ended", "rejected", "missed"]);

export const callSessionsTable = pgTable("call_sessions", {
  id: serial("id").primaryKey(),
  callerId: integer("caller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  receiverId: integer("receiver_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  status: callStatusEnum("status").notNull().default("ringing"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCallSessionSchema = createInsertSchema(callSessionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCallSession = z.infer<typeof insertCallSessionSchema>;
export type CallSession = typeof callSessionsTable.$inferSelect;
