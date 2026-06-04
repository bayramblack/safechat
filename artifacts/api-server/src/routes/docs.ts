import { Router, type IRouter, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const DOC_FILES: Record<string, string> = {
  readme: "README.md",
  documentation: "DOCUMENTATION.md",
  deployment: "DEPLOYMENT.md",
  license: "LICENSE",
};

interface DocCacheEntry {
  content: string;
  filename: string;
  loadedAt: number;
}

const cache = new Map<string, DocCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function findRepoRoot(startDir: string): Promise<string> {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    try {
      await fs.access(path.join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("Could not locate monorepo root (pnpm-workspace.yaml)");
}

router.get("/docs/:name", async (req: Request, res: Response) => {
  const name = String(req.params.name || "").toLowerCase();
  const filename = DOC_FILES[name];

  if (!filename) {
    res.status(404).json({ error: "Unknown document" });
    return;
  }

  try {
    const cached = cache.get(name);
    const now = Date.now();
    if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(cached.content);
      return;
    }

    const repoRoot = await findRepoRoot(__dirname);
    const fullPath = path.join(repoRoot, filename);
    const content = await fs.readFile(fullPath, "utf8");

    cache.set(name, { content, filename, loadedAt: now });

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(content);
  } catch (err) {
    logger.error({ err, name }, "Failed to read document");
    res.status(500).json({ error: "Failed to read document" });
  }
});

export default router;
