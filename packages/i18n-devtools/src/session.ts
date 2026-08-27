import { z } from 'zod';

const KEY = 'kroma:i18n-devtools';
const MAX_CHARS = 512;

const Session = z.object({
  open: z.boolean().default(false),
  keys: z.boolean().default(false),
  locale: z.string().max(16).nullable().default(null),
  x: z.number().finite().nullable().default(null),
  y: z.number().finite().nullable().default(null),
});

export type DevtoolsSession = z.infer<typeof Session>;

const CLOSED: DevtoolsSession = { open: false, keys: false, locale: null, x: null, y: null };

export function readSession(): DevtoolsSession {
  try {
    const stored = sessionStorage.getItem(KEY);
    if (!stored || stored.length > MAX_CHARS) return CLOSED;
    const parsed = Session.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : CLOSED;
  } catch {
    return CLOSED;
  }
}

/** Merge `patch` over what the tab already holds, and answer the result even
 *  where there is no storage to keep it in. */
export function writeSession(patch: Partial<DevtoolsSession>): DevtoolsSession {
  const next = { ...readSession(), ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}
