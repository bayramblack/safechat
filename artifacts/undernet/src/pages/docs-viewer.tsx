import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ArrowLeft, ChevronDown, Loader2, List } from "lucide-react";
import { parseDocument, type DocHeading } from "@/lib/markdown";

interface DocsViewerProps {
  onBack: () => void;
}

type Tab = "readme" | "documentation" | "deployment";

const TABS: { id: Tab; label: string }[] = [
  { id: "readme", label: "README" },
  { id: "documentation", label: "Overview" },
  { id: "deployment", label: "Deployment" },
];

const cache = new Map<Tab, string>();

interface ParsedCacheEntry {
  html: string;
  headings: DocHeading[];
}

const EMPTY_PARSED: ParsedCacheEntry = { html: "", headings: [] };

export default function DocsViewer({ onBack }: DocsViewerProps) {
  const [active, setActive] = useState<Tab>("readme");
  const [content, setContent] = useState<string>(cache.get("readme") || "");
  const [loading, setLoading] = useState(!cache.has("readme"));
  const [error, setError] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (cache.has(active)) {
      setContent(cache.get(active)!);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    fetch(`/api/docs/${active}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load (${r.status})`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        cache.set(active, text);
        setContent(text);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  const parsed = useMemo<ParsedCacheEntry>(() => {
    if (!content) return EMPTY_PARSED;
    return parseDocument(content);
  }, [content]);

  // When tab changes, scroll back to top, close ToC, clear pending anchor.
  useEffect(() => {
    setTocOpen(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [active]);

  // After content is rendered, if we have a pending anchor (from an in-doc
  // link to another doc), scroll to it.
  useEffect(() => {
    if (!pendingAnchor || loading || !articleRef.current) return;
    const id = pendingAnchor;
    const tryScroll = () => {
      const el = articleRef.current?.querySelector(
        `#${CSS.escape(id)}`,
      ) as HTMLElement | null;
      if (el && scrollRef.current) {
        const top =
          el.getBoundingClientRect().top -
          scrollRef.current.getBoundingClientRect().top +
          scrollRef.current.scrollTop -
          12;
        scrollRef.current.scrollTo({ top, behavior: "smooth" });
      }
    };
    // Defer to next frame so the new HTML is in the DOM.
    const raf = requestAnimationFrame(tryScroll);
    setPendingAnchor(null);
    return () => cancelAnimationFrame(raf);
  }, [pendingAnchor, loading, parsed.html]);

  const scrollToAnchor = useCallback((id: string) => {
    const article = articleRef.current;
    const scroller = scrollRef.current;
    if (!article || !scroller) return;
    const el = article.querySelector(
      `#${CSS.escape(id)}`,
    ) as HTMLElement | null;
    if (!el) return;
    const top =
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      12;
    scroller.scrollTo({ top, behavior: "smooth" });
  }, []);

  const handleArticleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const target = (e.target as HTMLElement).closest(
        "[data-doc],[data-anchor],[data-copy]",
      ) as HTMLElement | null;
      if (!target) return;

      if (target.hasAttribute("data-copy")) {
        e.preventDefault();
        const block = target.closest(".md-codeblock");
        const codeEl = block?.querySelector("pre code");
        const text = codeEl?.textContent ?? "";
        if (!text) return;
        const writeFallback = (): boolean => {
          try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            return ok;
          } catch {
            return false;
          }
        };
        const setLabel = (next: string) => {
          const label = target.querySelector(".md-copy-label");
          if (label) label.textContent = next;
        };
        const flashState = (cls: "is-copied" | "is-error", labelText: string) => {
          target.classList.add(cls);
          const label = target.querySelector(".md-copy-label");
          const prev = label?.textContent ?? "Copy";
          setLabel(labelText);
          window.setTimeout(() => {
            target.classList.remove(cls);
            setLabel(prev);
          }, 1500);
        };
        const onSuccess = () => flashState("is-copied", "Copied");
        const onFailure = () => flashState("is-error", "Failed");

        if (navigator.clipboard?.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(onSuccess)
            .catch(() => {
              if (writeFallback()) onSuccess();
              else onFailure();
            });
        } else {
          if (writeFallback()) onSuccess();
          else onFailure();
        }
        return;
      }

      if (target.hasAttribute("data-doc")) {
        e.preventDefault();
        const doc = target.getAttribute("data-doc") as Tab | null;
        const anchor = target.getAttribute("data-doc-anchor");
        if (!doc) return;
        if (doc === active) {
          if (anchor) {
            scrollToAnchor(anchor);
          } else if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
          }
        } else {
          if (anchor) setPendingAnchor(anchor);
          setActive(doc);
        }
        return;
      }

      if (target.hasAttribute("data-anchor")) {
        e.preventDefault();
        const id = target.getAttribute("data-anchor");
        if (id) scrollToAnchor(id);
      }
    },
    [active, scrollToAnchor],
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="safe-top flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Documentation</h1>
      </div>

      <div className="flex border-b border-border bg-background">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 px-4 py-3 text-xs font-medium transition-colors ${
              active === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        )}
        {error && !loading && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Make sure the API server is running.
            </p>
          </div>
        )}
        {!loading && !error && (
          <article
            ref={articleRef}
            className="docs-prose px-5 py-6"
            onClick={handleArticleClick}
          >
            {parsed.headings.length > 1 && (
              <div className={`docs-toc${tocOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="docs-toc-toggle"
                  onClick={() => setTocOpen((v) => !v)}
                  aria-expanded={tocOpen}
                >
                  <List className="docs-toc-icon" aria-hidden="true" />
                  <span className="docs-toc-title">
                    On this page
                    <span className="docs-toc-count">
                      {parsed.headings.length}
                    </span>
                  </span>
                  <ChevronDown
                    className={`docs-toc-chevron${tocOpen ? " is-open" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {tocOpen && (
                  <ol className="docs-toc-list">
                    {parsed.headings.map((h) => (
                      <li
                        key={h.id}
                        className={`docs-toc-item docs-toc-l${h.level}`}
                      >
                        <a
                          href={`#${h.id}`}
                          data-anchor={h.id}
                          onClick={() => setTocOpen(false)}
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <div dangerouslySetInnerHTML={{ __html: parsed.html }} />
          </article>
        )}
      </div>
    </div>
  );
}
