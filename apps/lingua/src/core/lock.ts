import { generalForm, groupMessages, type Message } from '@kromatv/i18n/model';
import { z } from 'zod';
import type { Messages } from './catalog';
import type { Source } from './source';

/** What a translation was made from and what it said then, as two digests; `machine` until a person reads it. */
export interface LockEntry {
  readonly source: string;
  readonly translation: string;
  readonly machine?: boolean;
}

/** One locale's lock entries, by message key. */
export type Lock = Map<string, LockEntry>;

/** Where one message stands in a locale. */
export type Standing = 'missing' | 'translated' | 'outdated' | 'unreviewed';

const VERSION = 1;
const MACHINE = 'mt';
const ENTRY = /^([0-9a-f]{8}) ([0-9a-f]{8})(?: (mt))?$/;

const LockFile = z.strictObject({
  version: z.literal(VERSION),
  messages: z.record(z.string(), z.string().regex(ENTRY)),
});

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const REMEMBERED = 20_000;
const remembered = new Map<string, Promise<string>>();

async function sha256Prefix(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return hex(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 8);
}

/** A message's templates as the 8-hex digest i18n-tools writes: SHA-256 over its sorted suffix and template pairs. */
export function digest(message: Pick<Message, 'key' | 'forms'>): Promise<string> {
  const ordered = Object.entries(message.forms)
    .map(([key, template]) => [key.slice(message.key.length), template] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const text = JSON.stringify(ordered);
  const held = remembered.get(text);
  if (held) {
    return held;
  }
  if (remembered.size >= REMEMBERED) {
    remembered.clear();
  }
  const made = sha256Prefix(text);
  remembered.set(text, made);
  return made;
}

/** The digest of each message, by key. */
export async function digests(messages: Iterable<Message>): Promise<Map<string, string>> {
  const all = [...messages];
  const said = await Promise.all(all.map(digest));
  return new Map(all.map((message, at) => [message.key, said[at] ?? '']));
}

function entryOf(text: string): LockEntry {
  const [, source = '', translation = '', machine] = ENTRY.exec(text) ?? [];
  return machine === MACHINE ? { source, translation, machine: true } : { source, translation };
}

/** A lock file's entries; a missing or unreadable one is empty, as i18n-tools reads it. */
export function parseLock(text: string | undefined): Lock {
  if (text === undefined) {
    return new Map();
  }
  try {
    const { messages } = LockFile.parse(JSON.parse(text));
    return new Map(Object.entries(messages).map(([key, entry]) => [key, entryOf(entry)]));
  } catch {
    return new Map();
  }
}

/** The lock file text, byte for byte as i18n-tools renders it. */
export function renderLock(lock: Lock): string {
  const messages: Record<string, string> = {};
  for (const key of [...lock.keys()].sort((a, b) => (a < b ? -1 : 1))) {
    const entry = lock.get(key);
    if (entry) {
      const flag = entry.machine ? ` ${MACHINE}` : '';
      messages[key] = `${entry.source} ${entry.translation}${flag}`;
    }
  }
  return `${JSON.stringify({ version: VERSION, messages }, null, 2)}\n`;
}

/** The source a locale is measured against, with the digest of each of its messages. */
export interface Baseline {
  readonly source: Source;
  readonly digests: ReadonlyMap<string, string>;
}

/** How one locale stands, message by message, and what its lock should say after this reading. */
export interface Inspected {
  readonly standing: Map<string, Standing>;
  readonly next: Lock;
}

function reconciled(
  from: string,
  said: string,
  recorded: LockEntry | undefined,
): { entry: LockEntry; standing: Standing } {
  const untouched = recorded?.translation === said;
  if (recorded && untouched && recorded.source !== from) {
    return { entry: recorded, standing: 'outdated' };
  }
  if (untouched && recorded?.machine) {
    return { entry: { source: from, translation: said, machine: true }, standing: 'unreviewed' };
  }
  return { entry: { source: from, translation: said }, standing: 'translated' };
}

/** Measure a locale's `catalog` against the source, as `i18n sync` does to write its lock. */
export async function inspect(
  against: Baseline,
  catalog: Messages,
  lock: Lock,
): Promise<Inspected> {
  const { messages } = groupMessages(catalog, against.source.bases);
  const said = await digests([...messages.values()].filter((m) => Boolean(generalForm(m))));
  const standing = new Map<string, Standing>();
  const next: Lock = new Map();
  for (const key of against.source.messages.keys()) {
    const translation = said.get(key);
    if (translation === undefined) {
      standing.set(key, 'missing');
      continue;
    }
    const reading = reconciled(against.digests.get(key) ?? '', translation, lock.get(key));
    next.set(key, reading.entry);
    standing.set(key, reading.standing);
  }
  return { standing, next };
}

/** `lock` with `keys` taken as right as they read: current against the source, and reviewed. */
export function confirmed(against: Baseline, lock: Lock, keys: Iterable<string>): Lock {
  const out: Lock = new Map(lock);
  for (const key of keys) {
    const entry = lock.get(key);
    const from = against.digests.get(key);
    if (entry && from !== undefined) {
      out.set(key, { source: from, translation: entry.translation });
    }
  }
  return out;
}
