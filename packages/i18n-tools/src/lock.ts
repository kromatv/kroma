import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Message } from '@kromatv/i18n/model';
import { z } from 'zod';

/** What a translation was made from, and what it said when that was recorded.
 *  Two digests, because either side can move: the source moving alone is what
 *  makes a translation outdated, and the translation moving is what makes it
 *  current again. */
export interface LockEntry {
  readonly source: string;
  readonly translation: string;
  /** Written by a machine and read by nobody yet. Cleared when a person edits
   *  the translation, or says it is right. */
  readonly machine?: boolean;
}

/** One locale's entries, by message key. */
export type Lock = Map<string, LockEntry>;

const VERSION = 1;
const MACHINE = 'mt';
const ENTRY = /^([0-9a-f]{8}) ([0-9a-f]{8})(?: (mt))?$/;

const LockFile = z.strictObject({
  version: z.literal(VERSION),
  messages: z.record(z.string(), z.string().regex(ENTRY)),
});

/** A message's templates as one short digest: the base and every plural
 *  variant, so a change to any of them is a change to the message. A variant
 *  is named by its suffix, so renaming the message leaves the digest alone. */
export function digest(message: Pick<Message, 'key' | 'forms'>): string {
  const ordered = Object.entries(message.forms)
    .map(([key, template]) => [key.slice(message.key.length), template] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex').slice(0, 8);
}

export function parseLock(text: string): Lock {
  const { messages } = LockFile.parse(JSON.parse(text));
  const lock: Lock = new Map();
  for (const [key, entry] of Object.entries(messages)) {
    const [, source = '', translation = '', machine] = ENTRY.exec(entry) ?? [];
    lock.set(
      key,
      machine === MACHINE ? { source, translation, machine: true } : { source, translation },
    );
  }
  return lock;
}

/** A lock that is missing or unreadable is an empty one: every translation on
 *  disk is then taken as current, which is what a first sync records. */
export function readLock(path: string): Lock {
  if (!existsSync(path)) return new Map();
  try {
    return parseLock(readFileSync(path, 'utf8'));
  } catch {
    return new Map();
  }
}

export function renderLock(lock: Lock): string {
  const messages: Record<string, string> = {};
  for (const key of [...lock.keys()].sort((a, b) => (a < b ? -1 : 1))) {
    const entry = lock.get(key);
    if (!entry) continue;
    const flag = entry.machine ? ` ${MACHINE}` : '';
    messages[key] = `${entry.source} ${entry.translation}${flag}`;
  }
  return `${JSON.stringify({ version: VERSION, messages }, null, 2)}\n`;
}

/** Write the lock, or remove it once it holds nothing. Returns whether the
 *  file moved. */
export function writeLock(path: string, lock: Lock): boolean {
  const present = existsSync(path);
  if (lock.size === 0) {
    if (present) rmSync(path);
    return present;
  }
  const next = renderLock(lock);
  if (present && readFileSync(path, 'utf8') === next) return false;
  writeFileSync(path, next);
  return true;
}

export function sameLock(a: Lock, b: Lock): boolean {
  if (a.size !== b.size) return false;
  for (const [key, entry] of a) {
    const other = b.get(key);
    if (other?.source !== entry.source || other.translation !== entry.translation) return false;
    if (Boolean(other.machine) !== Boolean(entry.machine)) return false;
  }
  return true;
}
