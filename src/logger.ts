import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_FILE = join(LOG_DIR, `bot-${new Date().toISOString().split('T')[0]}.log`);

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function formatMessage(level: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${timestamp} [${level}] ${message}`;
}

export function log(message: string): void {
  const formatted = formatMessage('INFO', message);
  console.log(formatted);
  try { appendFileSync(LOG_FILE, formatted + '\n'); } catch {}
}

export function warn(message: string): void {
  const formatted = formatMessage('WARN', message);
  console.warn(formatted);
  try { appendFileSync(LOG_FILE, formatted + '\n'); } catch {}
}

export function error(message: string): void {
  const formatted = formatMessage('ERROR', message);
  console.error(formatted);
  try { appendFileSync(LOG_FILE, formatted + '\n'); } catch {}
}
