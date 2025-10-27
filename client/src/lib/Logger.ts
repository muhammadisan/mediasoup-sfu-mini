export type LogLevel = "info" | "warn" | "error";
export type LogLine = { ts: string; level: LogLevel; msg: string };
export type LogFn = (msg: string, level?: LogLevel) => void;

export class Logger {
  private sink: (line: LogLine) => void;
  constructor(sink: (line: LogLine) => void) { this.sink = sink; }
  private line(level: LogLevel, msg: string) {
    const ts = new Date().toLocaleTimeString();
    const payload = { ts, level, msg };
    this.sink(payload);
    const fmt = `[${ts}] ${msg}`;
    if (level === "info") console.log(fmt); else if (level === "warn") console.warn(fmt); else console.error(fmt);
  }
  info(msg: string) { this.line("info", msg); }
  warn(msg: string) { this.line("warn", msg); }
  error(msg: string) { this.line("error", msg); }
}
