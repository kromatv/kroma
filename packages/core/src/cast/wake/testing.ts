import { vi } from 'vitest';
import type { LanSocket, WakeAnswer, WakeKeys, WakeReach } from './reach';

/** A television's side of a conversation: it says `frames` in order, a string
 * as it is and anything else as JSON, then nothing, and remembers what it was
 * sent. */
export function scripted(frames: unknown[]) {
  const said = frames.map((frame) => (typeof frame === 'string' ? frame : JSON.stringify(frame)));
  const sent: unknown[] = [];
  const socket: LanSocket = {
    send: vi.fn((text: string) => {
      sent.push(JSON.parse(text));
      return Promise.resolve();
    }),
    next: vi.fn(() => {
      const frame = said.shift();
      return frame === undefined ? Promise.reject(new Error('no answer')) : Promise.resolve(frame);
    }),
    close: vi.fn(),
  };
  return { socket, sent };
}

/** Keys held in memory. */
export function remembering(known: Record<string, string> = {}) {
  const kept = new Map(Object.entries(known));
  const keys: WakeKeys = {
    get: (address) => Promise.resolve(kept.get(address) ?? null),
    set: (address, key) => {
      kept.set(address, key);
      return Promise.resolve();
    },
  };
  return { keys, kept };
}

const SILENT = () => Promise.reject(new Error('no answer'));

/** A platform where `GET` answers `info`, `POST` answers 200, and no socket
 * opens unless `extra` gives one. */
export function reaching(info: WakeAnswer | null, extra: Partial<WakeReach> = {}) {
  const http = vi.fn((method: 'GET' | 'POST') =>
    Promise.resolve(method === 'GET' ? info : { status: 200, text: 'true' }),
  );
  return { open: vi.fn(SILENT), ...extra, http };
}
