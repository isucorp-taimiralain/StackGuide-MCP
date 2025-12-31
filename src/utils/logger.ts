/**
 * Structured logging utility for StackGuide MCP Server
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

class Logger {
  private level: LogLevel = 'info';
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  private formatEntry(entry: LogEntry): string {
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    // MCP uses stderr for logging (stdout is for protocol communication)
    console.error(this.formatEntry(entry));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  /**
   * Log tool execution with timing
   */
  tool(toolName: string, args: Record<string, unknown>, startTime?: number): void {
    const duration = startTime ? `${Date.now() - startTime}ms` : undefined;
    this.info(`Tool: ${toolName}`, { args, duration });
  }
}

// Singleton instance
export const logger = new Logger();

// Set log level from environment
if (process.env.STACKGUIDE_LOG_LEVEL) {
  const envLevel = process.env.STACKGUIDE_LOG_LEVEL.toLowerCase() as LogLevel;
  if (['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    logger.setLevel(envLevel);
  }
}
