export type LogLevel = "info" | "success" | "error" | "warn" | "request" | "response" | "socket";

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
}

export type TestStatus = "pending" | "running" | "pass" | "fail" | "skipped";

export interface TestResult {
  id: string;
  name: string;
  group: string;
  status: TestStatus;
  duration?: number;
  error?: string;
}

export type TestFn = (ctx: TestContext) => Promise<void>;

export interface TestCase {
  id: string;
  name: string;
  group: string;
  fn: TestFn;
}

export interface TestContext {
  log: (level: LogLevel, message: string) => void;
  store: Record<string, unknown>;
  assert: (condition: boolean, message: string) => void;
  assertEqual: (actual: unknown, expected: unknown, label: string) => void;
  assertExists: (value: unknown, label: string) => void;
  assertType: (value: unknown, type: string, label: string) => void;
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export type RunnerListener = (results: TestResult[], logs: LogEntry[]) => void;

export class TestRunner {
  private tests: TestCase[] = [];
  private results: TestResult[] = [];
  private logs: LogEntry[] = [];
  private listeners: Set<RunnerListener> = new Set();
  private running = false;
  private aborted = false;

  register(test: TestCase): void {
    this.tests.push(test);
  }

  registerAll(tests: TestCase[]): void {
    this.tests.push(...tests);
  }

  onUpdate(listener: RunnerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l([...this.results], [...this.logs]));
  }

  private addLog(level: LogLevel, message: string): void {
    this.logs.push({ timestamp: Date.now(), level, message });
    this.notify();
  }

  isRunning(): boolean {
    return this.running;
  }

  abort(): void {
    this.aborted = true;
  }

  async runAll(): Promise<TestResult[]> {
    this.running = true;
    this.aborted = false;
    this.logs = [];
    this.results = this.tests.map((t) => ({
      id: t.id,
      name: t.name,
      group: t.group,
      status: "pending" as TestStatus,
    }));
    this.notify();

    const store: Record<string, unknown> = {};

    this.addLog("info", `Starting ${this.tests.length} tests...`);

    for (let i = 0; i < this.tests.length; i++) {
      if (this.aborted) {
        for (let j = i; j < this.tests.length; j++) {
          this.results[j].status = "skipped";
        }
        this.addLog("warn", "Test run aborted by user");
        break;
      }

      const test = this.tests[i];
      this.results[i].status = "running";
      this.notify();
      this.addLog("info", `[${i + 1}/${this.tests.length}] Running: ${test.name}`);

      const start = performance.now();

      const ctx: TestContext = {
        log: (level, message) => this.addLog(level, `  ${message}`),
        store,
        assert: (condition, message) => {
          if (!condition) throw new Error(`Assertion failed: ${message}`);
        },
        assertEqual: (actual, expected, label) => {
          if (actual !== expected) {
            throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
          }
        },
        assertExists: (value, label) => {
          if (value === null || value === undefined) {
            throw new Error(`${label}: expected value to exist, got ${String(value)}`);
          }
        },
        assertType: (value, type, label) => {
          if (typeof value !== type) {
            throw new Error(`${label}: expected type ${type}, got ${typeof value}`);
          }
        },
        fetch: async (url: string, options?: RequestInit) => {
          const method = options?.method || "GET";
          this.addLog("request", `  ${method} ${url}`);
          const res = await fetch(url, { ...options, credentials: "omit" });
          const statusColor = res.ok ? "success" : "error";
          this.addLog(statusColor as LogLevel, `  → ${res.status} ${res.statusText}`);
          if (!res.ok) {
            try {
              const clone = res.clone();
              const body = await clone.text();
              if (body) this.addLog("error", `  Response: ${body.slice(0, 200)}`);
            } catch {}
          }
          return res;
        },
      };

      try {
        await test.fn(ctx);
        const duration = Math.round(performance.now() - start);
        this.results[i].status = "pass";
        this.results[i].duration = duration;
        this.addLog("success", `  ✓ PASS (${duration}ms)`);
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        this.results[i].status = "fail";
        this.results[i].duration = duration;
        this.results[i].error = err instanceof Error ? err.message : String(err);
        this.addLog("error", `  ✗ FAIL: ${this.results[i].error} (${duration}ms)`);
      }

      this.notify();
    }

    if (store.socketA && typeof (store.socketA as { disconnect?: () => void }).disconnect === "function") {
      (store.socketA as { disconnect: () => void }).disconnect();
    }
    if (store.socketB && typeof (store.socketB as { disconnect?: () => void }).disconnect === "function") {
      (store.socketB as { disconnect: () => void }).disconnect();
    }

    const passed = this.results.filter((r) => r.status === "pass").length;
    const failed = this.results.filter((r) => r.status === "fail").length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;
    this.addLog(
      failed > 0 ? "error" : "success",
      `\nCompleted: ${passed} passed, ${failed} failed, ${skipped} skipped out of ${this.tests.length} tests`,
    );

    this.running = false;
    this.notify();
    return this.results;
  }
}
