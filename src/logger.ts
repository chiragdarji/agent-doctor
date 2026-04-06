export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function createLogger(minLevel: LogLevel): Logger {
  const min = LEVELS[minLevel];

  function log(level: LogLevel, message: string): void {
    if (LEVELS[level] !== undefined && (LEVELS[level] as number) >= min) {
      process.stderr.write(`[agent-doctor:${level}] ${message}\n`);
    }
  }

  return {
    debug: (m) => log('debug', m),
    info: (m) => log('info', m),
    warn: (m) => log('warn', m),
    error: (m) => log('error', m),
  };
}

const VALID_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const envLevel = process.env['AGENT_DOCTOR_LOG_LEVEL'];
const resolvedLevel: LogLevel =
  envLevel !== undefined && (VALID_LEVELS as readonly string[]).includes(envLevel)
    ? (envLevel as LogLevel)
    : 'warn';

export const logger: Logger = createLogger(resolvedLevel);
