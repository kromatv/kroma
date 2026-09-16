import { vi } from 'vitest';
import type { OutboundMessage } from './deliver';
import type { Env, RateLimit } from './index';
import type { Counters } from './limits';

export const SECRET = 'a-test-sealing-secret-that-is-long-enough';
export const ORIGIN = 'https://kroma.example';
export const ADDRESS = 'reader@example.test';
export const FAR = 4_000_000_000;

export const allow = (): RateLimit => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
export const deny = (): RateLimit => ({ limit: vi.fn().mockResolvedValue({ success: false }) });

export function memoryCounters(): Counters & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
  };
}

export function outbox(): {
  sent: OutboundMessage[];
  send: (message: OutboundMessage) => Promise<unknown>;
} {
  const sent: OutboundMessage[] = [];
  const send = vi.fn(async (message: OutboundMessage) => {
    sent.push(message);
    return { messageId: 'm1' };
  });
  return { sent, send };
}

export function testEnv(): Env & { sent: OutboundMessage[] } {
  const { sent, send } = outbox();
  return {
    GRANT_SECRET: SECRET,
    LIMIT_SECRET: 'a-test-limit-secret',
    FROM_ADDRESS: 'no-reply@kroma.tv',
    FROM_NAME: 'KROMA',
    PUBLIC_URL: 'https://mail.kroma.tv',
    EMAIL: { send },
    COUNTERS: memoryCounters(),
    ENROL_IP: allow(),
    SEND_IP: allow(),
    SEND_ADDR: allow(),
    sent,
  };
}

export const post = (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const json = JSON.stringify(body);
  return new Request(`https://mail.kroma.tv${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(json).byteLength),
      ...headers,
    },
    body: json,
  });
};

export const get = (path: string) => new Request(`https://mail.kroma.tv${path}`);
