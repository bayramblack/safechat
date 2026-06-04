import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { db, attachmentsTable, messagesTable, conversationsTable, usersTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "video/webm",
  "video/mp4",
  "video/ogg",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp",
  ".pdf", ".txt", ".zip", ".doc", ".docx",
  ".webm", ".ogg", ".mp4", ".mp3", ".wav", ".m4a",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
  ".sh", ".bash", ".csh", ".ksh",
  ".js", ".vbs", ".wsf", ".ps1",
  ".dll", ".so", ".dylib",
]);

function sanitizeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext);
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 100);
  const uniqueId = crypto.randomBytes(8).toString("hex");
  return `${sanitized}_${uniqueId}${ext}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const storageService = new ObjectStorageService();

router.post("/upload", authMiddleware, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    res.status(400).json({ error: `File extension ${ext} is not allowed` });
    return;
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    res.status(400).json({ error: "Executable files are not allowed" });
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
    res.status(400).json({ error: `MIME type ${req.file.mimetype} is not allowed` });
    return;
  }

  if (req.file.size > MAX_FILE_SIZE) {
    res.status(400).json({ error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    return;
  }

  const safeName = sanitizeFilename(req.file.originalname);

  try {
    const uploadUrl = await storageService.getObjectEntityUploadURL();

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });

    if (!uploadResponse.ok) {
      res.status(500).json({ error: "Failed to upload file to storage" });
      return;
    }

    const objectPath = storageService.normalizeObjectEntityPath(uploadUrl);

    const [attachment] = await db
      .insert(attachmentsTable)
      .values({
        uploadedBy: req.userId!,
        originalName: req.file.originalname,
        safeName,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        storageKey: objectPath,
      })
      .returning();

    res.status(201).json({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      storageKey: attachment.storageKey,
    });
  } catch (error) {
    req.log.error({ error }, "File upload failed");
    res.status(500).json({ error: "File upload failed" });
  }
});

router.get("/download/:id", authMiddleware, async (req, res): Promise<void> => {
  const attachmentId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (isNaN(attachmentId)) {
    res.status(400).json({ error: "Invalid attachment ID" });
    return;
  }

  const [attachment] = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.id, attachmentId));

  if (!attachment) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  if (!attachment.messageId) {
    const downloadPath = `/api/download/${attachmentId}`;
    const [avatarUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.avatarUrl, downloadPath));

    if (!avatarUser && attachment.uploadedBy !== req.userId!) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  } else {
    const [linkedMessage] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, attachment.messageId));

    if (!linkedMessage) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, linkedMessage.conversationId),
          or(
            eq(conversationsTable.participantA, req.userId!),
            eq(conversationsTable.participantB, req.userId!),
          ),
        ),
      );

    if (!conversation) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  try {
    const file = await storageService.getObjectEntityFile(attachment.storageKey);
    const isInline = attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("audio/") || attachment.mimeType.startsWith("video/");
    const disposition = isInline ? "inline" : "attachment";

    const response = await storageService.downloadObject(file);
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${attachment.safeName}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(buffer);
  } catch (error) {
    req.log.error({ error }, "File download failed");
    res.status(500).json({ error: "File download failed" });
  }
});

export default router;
