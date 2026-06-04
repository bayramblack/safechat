import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../lib/auth";

const router = Router();

const POE_API_URL = "https://api.poe.com/v1/chat/completions";
const POE_MODEL = "gemini-pro-uncensor";

router.post("/ai/chat", authMiddleware, async (req: Request, res: Response) => {
  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI service not configured" });
    return;
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  try {
    const upstream = await fetch(POE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: POE_MODEL,
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "Unknown error");
      res.status(upstream.status).json({ error: errText });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.end();
      return;
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ error: "AI service unavailable" });
    } else {
      res.end();
    }
  }
});

export default router;
