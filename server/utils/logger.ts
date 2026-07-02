import crypto from 'crypto';

export type LogLevel = 'info' | 'warn' | 'error';

export interface StructuredLog {
  ts: string;
  level: LogLevel;
  tag: string;
  cid?: string;
  msg: string;
  [key: string]: unknown;
}

/** Emit a structured JSON log line to stdout/stderr. */
export function log(level: LogLevel, tag: string, msg: string, fields: Record<string, unknown> = {}, cid?: string): void {
  const entry: StructuredLog = { ts: new Date().toISOString(), level, tag, msg, ...fields };
  if (cid) entry.cid = cid;
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Generate a short correlation ID for tracing a pipeline run. */
export function newCid(): string {
  return crypto.randomBytes(6).toString('hex');
}
