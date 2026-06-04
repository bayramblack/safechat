import { pgTable, serial, integer, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { messagesTable } from "./messages";

export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  uploadedBy: integer("uploaded_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  messageId: integer("message_id").references(() => messagesTable.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  safeName: text("safe_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttachmentSchema = createInsertSchema(attachmentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachmentsTable.$inferSelect;
