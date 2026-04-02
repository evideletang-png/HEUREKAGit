type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  dossierId?: string;
  traceId?: string;
}

/**
 * Structured Logger for Production.
 * Outputs JSON for easy parsing by observability tools.
 */
export const logger = {
  log(level: LogLevel, message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context
    };
    console.log(JSON.stringify(entry));
  },

  info(message: string, context?: Record<string, any>) {
    this.log("info", message, context);
  },

  warn(message: string, context?: Record<string, any>) {
    this.log("warn", message, context);
  },

  error(message: string, error?: any, context?: Record<string, any>) {
    this.log("error", message, {
      ...context,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error
    });
  },

  debug(message: string, context?: Record<string, any>) {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
      this.log("debug", message, context);
    }
  }
};
