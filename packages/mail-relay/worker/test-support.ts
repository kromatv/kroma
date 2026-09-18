import { b64url } from '@kromatv/relay-grant';
import { vi } from 'vitest';
import { Marks, sealPending } from './activation';
import type { OutboundMessage } from './deliver';
import { INSTANCE_TTL_SECS, sealInstance } from './identity';
import type { Env, RateLimit } from './index';
import type { Counters } from './limits';

export const SECRET = 'a-test-sealing-secret-that-is-long-enough';
export const LIMIT_SECRET = 'a-test-limit-secret';
export const ORIGIN = 'https://kroma.example';
export const ADDRESS = 'reader@example.test';
export const FAR = 4_000_000_000;
export const PUBLIC_URL = 'https://mail.kroma.tv';

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
    delete: async (key) => {
      store.delete(key);
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

export function testEnv(): Env & {
  sent: OutboundMessage[];
  COUNTERS: ReturnType<typeof memoryCounters>;
} {
  const { sent, send } = outbox();
  return {
    GRANT_SECRET: SECRET,
    LIMIT_SECRET,
    FROM_ADDRESS: 'no-reply@kroma.tv',
    FROM_NAME: 'KROMA',
    PUBLIC_URL,
    EMAIL: { send },
    COUNTERS: memoryCounters(),
    ENROL_IP: allow(),
    SEND_IP: allow(),
    SEND_ADDR: allow(),
    sent,
  };
}

export const OWNER = 'owner@example.test';
export const SERVER_IP = '203.0.113.7';

export const marks = (env: Env) => new Marks(env.COUNTERS, env.LIMIT_SECRET);

/** Mark `origin` as activated by `by`, as the owner's click would. */
export function activated(env: Env, origin = ORIGIN, by = OWNER): Promise<void> {
  return marks(env).activate(origin, by);
}

/** A server's identity as the relay sees it: its P-256 key, and its instance blob. */
export interface Server {
  origin: string;
  publicKey: string;
  privateKey: CryptoKey;
  instance: string;
}

const utf8 = new TextEncoder();

export async function keypair(): Promise<{ publicKey: string; privateKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  return { publicKey: b64url(raw), privateKey: pair.privateKey };
}

export async function sign(privateKey: CryptoKey, text: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    utf8.encode(text),
  );
  return b64url(sig);
}

/** A server the relay already registered, so tests can skip the challenge. */
export async function registered(origin = ORIGIN): Promise<Server> {
  const { publicKey, privateKey } = await keypair();
  const instance = await sealInstance(SECRET, {
    o: origin,
    k: publicKey,
    e: Math.floor(Date.now() / 1000) + INSTANCE_TTL_SECS,
  });
  return { origin, publicKey, privateKey, instance };
}

/** The envelope `server` sends for `payload`, stamped now unless told otherwise. */
export async function signed(server: Server, payload: Record<string, unknown>) {
  const text = JSON.stringify({ ts: Math.floor(Date.now() / 1000), ...payload });
  return {
    instance: server.instance,
    payload: text,
    signature: await sign(server.privateKey, text),
  };
}

export async function pendingFor(address = OWNER, origin = ORIGIN, token = 'tok-1234567890') {
  return sealPending(SECRET, { a: address, o: origin, t: token, i: SERVER_IP, e: FAR });
}

export const post = (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const json = JSON.stringify(body);
  return new Request(`${PUBLIC_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(json).byteLength),
      ...headers,
    },
    body: json,
  });
};

export const get = (path: string) => new Request(`${PUBLIC_URL}${path}`);
