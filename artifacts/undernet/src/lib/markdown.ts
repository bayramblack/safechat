import { highlightCode } from "./syntax-highlight";

export interface DocHeading {
  level: number;
  id: string;
  text: string;
}

export interface ParsedDoc {
  html: string;
  headings: DocHeading[];
}

const INTERNAL_DOC_MAP: Record<string, string> = {
  "readme.md": "readme",
  "documentation.md": "documentation",
  "deployment.md": "deployment",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function plainText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export function normalizeAnchorId(text: string): string {
  return (
    plainText(text)
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

export function slugify(text: string, taken: Map<string, number>): string {
  const base = normalizeAnchorId(text);
  const count = taken.get(base) ?? 0;
  taken.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function classifyHref(
  href: string,
): { type: "doc"; doc: string; hash: string } | { type: "anchor"; id: string } | { type: "external" } {
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) {
    return { type: "anchor", id: normalizeAnchorId(safeDecode(trimmed.slice(1))) };
  }
  // Match (./)?(README|DOCUMENTATION|DEPLOYMENT).md(#hash)?
  const docMatch = /^\.?\.?\/?([A-Za-z][\w-]*\.md)(?:#(.*))?$/i.exec(trimmed);
  if (docMatch) {
    const file = docMatch[1]!.toLowerCase();
    const doc = INTERNAL_DOC_MAP[file];
    if (doc) {
      const rawHash = docMatch[2] ?? "";
      const hash = rawHash ? normalizeAnchorId(safeDecode(rawHash)) : "";
      return { type: "doc", doc, hash };
    }
  }
  return { type: "external" };
}

function renderInline(text: string): string {
  let out = escapeHtml(text);

  out = out.replace(
    /`([^`]+)`/g,
    (_m, code: string) => `<code class="md-inline-code">${code}</code>`,
  );

  out = out.replace(
    /\*\*([^*]+)\*\*/g,
    (_m, body: string) => `<strong>${body}</strong>`,
  );
  out = out.replace(
    /(^|[^*])\*([^*\n]+)\*/g,
    (_m, lead: string, body: string) => `${lead}<em>${body}</em>`,
  );

  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label: string, href: string) => {
      const decodedHref = href
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      const classification = classifyHref(decodedHref);
      if (classification.type === "doc") {
        const dataDoc = escapeAttr(classification.doc);
        const dataAnchor = classification.hash
          ? ` data-doc-anchor="${escapeAttr(classification.hash)}"`
          : "";
        return `<a href="#" data-doc="${dataDoc}"${dataAnchor}>${label}</a>`;
      }
      if (classification.type === "anchor") {
        const id = escapeAttr(classification.id);
        return `<a href="#${id}" data-anchor="${id}">${label}</a>`;
      }
      const safeHref = /^(https?:|mailto:|\/|\.\/|\.\.\/)/i.test(decodedHref)
        ? escapeAttr(decodedHref)
        : "#";
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );

  return out;
}

function renderCodeBlock(lang: string, code: string): string {
  const normalizedLang = lang.trim().toLowerCase();
  const highlighted = normalizedLang
    ? highlightCode(code, normalizedLang)
    : escapeHtml(code);
  const langLabel = normalizedLang ? escapeHtml(normalizedLang) : "code";
  const codeClass = normalizedLang ? ` class="lang-${escapeAttr(normalizedLang)}"` : "";
  return [
    `<div class="md-codeblock" data-lang="${escapeAttr(langLabel)}">`,
    `<div class="md-codeblock-bar">`,
    `<span class="md-codeblock-lang">${langLabel}</span>`,
    `<button type="button" class="md-copy" data-copy aria-label="Copy code">`,
    `<span class="md-copy-label">Copy</span>`,
    `</button>`,
    `</div>`,
    `<pre><code${codeClass}>${highlighted}</code></pre>`,
    `</div>`,
  ].join("");
}

export function parseDocument(md: string): ParsedDoc {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  const headings: DocHeading[] = [];
  const takenSlugs = new Map<string, number>();

  let inCodeBlock = false;
  let codeLang = "";
  let codeBuffer: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];
  let inParagraph = false;
  let paraBuffer: string[] = [];

  const flushParagraph = () => {
    if (inParagraph && paraBuffer.length > 0) {
      out.push(`<p>${renderInline(paraBuffer.join(" "))}</p>`);
    }
    inParagraph = false;
    paraBuffer = [];
  };

  const flushList = () => {
    if (inList && listType) {
      out.push(`</${listType}>`);
    }
    inList = false;
    listType = null;
  };

  const flushTable = () => {
    if (!inTable) return;
    let html = `<div class="md-table-wrap"><table><thead><tr>`;
    for (const h of tableHeader) html += `<th>${renderInline(h.trim())}</th>`;
    html += `</tr></thead><tbody>`;
    for (const row of tableRows) {
      html += `<tr>`;
      for (const cell of row) html += `<td>${renderInline(cell.trim())}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    out.push(html);
    inTable = false;
    tableHeader = [];
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (inCodeBlock) {
      if (/^```/.test(line)) {
        out.push(renderCodeBlock(codeLang, codeBuffer.join("\n")));
        codeBuffer = [];
        codeLang = "";
        inCodeBlock = false;
      } else {
        codeBuffer.push(line);
      }
      continue;
    }

    const fenceMatch = /^(\s*)```\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      flushTable();
      inCodeBlock = true;
      codeLang = fenceMatch[2] ?? "";
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim().replace(/\s+#+\s*$/, "");
      const id = slugify(text, takenSlugs);
      const plain = plainText(text);
      if (level >= 2 && level <= 3) {
        headings.push({ level, id, text: plain });
      }
      out.push(
        `<h${level} id="${escapeAttr(id)}" class="md-heading md-h${level}">` +
          `<a class="md-heading-anchor" href="#${escapeAttr(id)}" data-anchor="${escapeAttr(id)}" aria-label="Link to ${escapeAttr(plain)}">#</a>` +
          `<span class="md-heading-text">${renderInline(text)}</span>` +
          `</h${level}>`,
      );
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph();
      flushList();
      flushTable();
      out.push("<hr />");
      continue;
    }

    const tableRowMatch = /^\s*\|(.+)\|\s*$/.exec(line);
    if (tableRowMatch) {
      const cells = tableRowMatch[1]!.split("|").map((c) => c.trim());
      const next = lines[i + 1] ?? "";
      const isAlignmentRow = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(
        next,
      );
      if (!inTable && isAlignmentRow) {
        flushParagraph();
        flushList();
        inTable = true;
        tableHeader = cells;
        i++;
        continue;
      }
      if (inTable) {
        tableRows.push(cells);
        continue;
      }
    } else if (inTable) {
      flushTable();
    }

    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ulMatch || olMatch) {
      flushParagraph();
      const newType: "ul" | "ol" = ulMatch ? "ul" : "ol";
      const itemText = (ulMatch ? ulMatch[1] : olMatch![1])!;
      if (!inList || listType !== newType) {
        flushList();
        inList = true;
        listType = newType;
        out.push(`<${listType}>`);
      }
      out.push(`<li>${renderInline(itemText)}</li>`);
      continue;
    } else if (inList) {
      flushList();
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      continue;
    }

    if (!inParagraph) {
      inParagraph = true;
      paraBuffer = [line.trim()];
    } else {
      paraBuffer.push(line.trim());
    }
  }

  if (inCodeBlock) {
    out.push(renderCodeBlock(codeLang, codeBuffer.join("\n")));
  }
  flushParagraph();
  flushList();
  flushTable();

  return { html: out.join("\n"), headings };
}

export function renderMarkdown(md: string): string {
  return parseDocument(md).html;
}
