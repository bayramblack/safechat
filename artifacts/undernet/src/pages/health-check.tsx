import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Play, Square, ChevronDown, ChevronUp, Terminal, Activity, CheckCircle, XCircle, Clock, Loader2, SkipForward } from "lucide-react";
import { TestRunner, type TestResult, type LogEntry, type LogLevel } from "@/lib/test-runner";
import { createTestScenarios } from "@/lib/test-scenarios";

interface HealthCheckProps {
  onBack: () => void;
}

function getStatusIcon(status: TestResult["status"]) {
  switch (status) {
    case "pass":
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "fail":
      return <XCircle className="w-4 h-4 text-red-400" />;
    case "running":
      return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
    case "skipped":
      return <SkipForward className="w-4 h-4 text-zinc-500" />;
    case "pending":
      return <Clock className="w-4 h-4 text-zinc-600" />;
  }
}

function getLogColor(level: LogLevel): string {
  switch (level) {
    case "success":
      return "text-emerald-400";
    case "error":
      return "text-red-400";
    case "warn":
      return "text-yellow-400";
    case "request":
      return "text-cyan-400";
    case "response":
      return "text-blue-400";
    case "socket":
      return "text-purple-400";
    case "info":
    default:
      return "text-zinc-400";
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

export default function HealthCheck({ onBack }: HealthCheckProps) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const runnerRef = useRef<TestRunner | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current && showLogs) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showLogs]);

  const handleRun = useCallback(async () => {
    const runner = new TestRunner();
    runnerRef.current = runner;

    const scenarios = createTestScenarios();
    runner.registerAll(scenarios);

    runner.onUpdate((r, l) => {
      setResults([...r]);
      setLogs([...l]);
    });

    setRunning(true);
    setExpandedErrors(new Set());
    setShowLogs(true);
    await runner.runAll();
    setRunning(false);
    runnerRef.current = null;
  }, []);

  const handleStop = useCallback(() => {
    runnerRef.current?.abort();
  }, []);

  const toggleError = useCallback((id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const total = results.length;
  const done = results.filter((r) => r.status !== "pending" && r.status !== "running").length;

  const groups = results.reduce<Record<string, TestResult[]>>((acc, r) => {
    if (!acc[r.group]) acc[r.group] = [];
    acc[r.group].push(r);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="safe-top flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <Activity className="w-5 h-5 text-emerald-400" />
        <h1 className="text-lg font-bold text-zinc-100 font-mono">Health Check</h1>
      </div>

      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
        {!running ? (
          <button
            onClick={handleRun}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors font-mono text-sm font-medium"
          >
            <Play className="w-4 h-4" />
            Run All Tests
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors font-mono text-sm font-medium"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}

        {total > 0 && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-emerald-400">{passed} passed</span>
            {failed > 0 && <span className="text-red-400">{failed} failed</span>}
            <span className="text-zinc-500">{done}/{total}</span>
            {running && (
              <div
                className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden"
                style={{ "--progress": (done / total) * 100 } as React.CSSProperties}
              >
                <div className="progress-fill h-full bg-emerald-500 rounded-full" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {total === 0 && !running && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3 px-6">
            <Activity className="w-12 h-12 text-zinc-700" />
            <p className="text-sm font-mono text-center">
              Click "Run All Tests" to run integration tests against the API, messaging, and WebSocket systems.
            </p>
          </div>
        )}

        {Object.entries(groups).map(([group, groupResults]) => (
          <div key={group} className="border-b border-zinc-800/50">
            <div className="px-4 py-2 bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">{group}</span>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-emerald-500">{groupResults.filter((r) => r.status === "pass").length}</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-zinc-400">{groupResults.length}</span>
                </div>
              </div>
            </div>
            {groupResults.map((result) => (
              <div key={result.id}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900/50 transition-colors text-left"
                  onClick={() => result.error && toggleError(result.id)}
                >
                  {getStatusIcon(result.status)}
                  <span className={`flex-1 text-sm font-mono ${result.status === "fail" ? "text-red-300" : result.status === "pass" ? "text-zinc-200" : "text-zinc-500"}`}>
                    {result.name}
                  </span>
                  {result.duration !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-600">{result.duration}ms</span>
                  )}
                  {result.error && (
                    expandedErrors.has(result.id)
                      ? <ChevronUp className="w-3 h-3 text-zinc-600" />
                      : <ChevronDown className="w-3 h-3 text-zinc-600" />
                  )}
                </button>
                {result.error && expandedErrors.has(result.id) && (
                  <div className="mx-4 mb-2 px-3 py-2 bg-red-950/30 border border-red-900/30 rounded text-xs font-mono text-red-300 break-all">
                    {result.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-900/50 transition-colors"
        >
          <Terminal className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-mono text-zinc-400 font-medium">
            Log Viewer
          </span>
          <span className="text-[10px] font-mono text-zinc-600 ml-1">({logs.length} entries)</span>
          <div className="flex-1" />
          {showLogs ? (
            <ChevronDown className="w-4 h-4 text-zinc-600" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-600" />
          )}
        </button>

        {showLogs && (
          <div className="h-52 overflow-y-auto bg-[#050505] border-t border-zinc-800/50 px-3 py-2 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 && (
              <div className="text-zinc-700 italic">No logs yet. Run tests to see activity...</div>
            )}
            {logs.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-zinc-700 whitespace-nowrap select-none">{formatTime(entry.timestamp)}</span>
                <span className={`${getLogColor(entry.level)} whitespace-pre-wrap break-all`}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
