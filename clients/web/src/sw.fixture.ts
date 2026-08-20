// The service worker is a classic script, not a module, so these tests evaluate
// it against a fake `self` and drive the listeners it registered.
import { standaloneOptions } from '@kroma/bundler/standalone-script';
import { build } from 'esbuild';
import { swScript } from '../sw.build';

type Listener = (event: unknown) => void;

export type Shown = { title: string; options: Record<string, unknown> };

export interface Harness {
  fire: (type: string, event: unknown) => Promise<void>;
  shown: Shown[];
  fetches: Array<{ url: string; init?: RequestInit }>;
  opened: string[];
  focused: number;
  navigated: string[];
  clients: Array<Record<string, unknown>>;
  setFetch: (impl: (url: string, init?: RequestInit) => Promise<unknown>) => void;
}

// Bundled from source with the same options the build ships, rather than read
// out of public/, where the artefact only exists if somebody ran a build.
const [output] = (await build({ ...standaloneOptions(swScript), outfile: undefined, write: false }))
  .outputFiles;
if (!output) throw new Error('esbuild produced no service worker to test');
const SOURCE = output.text;

export function load(clientList: Array<Record<string, unknown>> = []): Harness {
  const listeners = new Map<string, Listener>();
  const shown: Shown[] = [];
  const fetches: Array<{ url: string; init?: RequestInit }> = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const state = { focused: 0 };
  let fetchImpl: (url: string, init?: RequestInit) => Promise<unknown> = async () => ({ ok: true });

  let pending: Promise<unknown> = Promise.resolve();

  const clients = clientList.map((c) => ({
    ...c,
    focus: async () => {
      state.focused += 1;
    },
    navigate:
      c.navigate ??
      (async (url: string) => {
        navigated.push(url);
      }),
  }));

  const self = {
    location: { origin: 'https://kroma.test' },
    skipWaiting: () => {},
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => clients,
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };

  const fetchSpy = (url: string, init?: RequestInit) => {
    fetches.push({ url, init });
    return fetchImpl(url, init);
  };

  // eslint-disable-next-line no-new-func
  new Function('self', 'fetch', 'btoa', 'URL', 'Uint8Array', SOURCE)(
    self,
    fetchSpy,
    (s: string) => Buffer.from(s, 'binary').toString('base64'),
    URL,
    Uint8Array,
  );

  return {
    shown,
    fetches,
    opened,
    navigated,
    clients,
    get focused() {
      return state.focused;
    },
    setFetch: (impl) => {
      fetchImpl = impl;
    },
    fire: async (type, event) => {
      const fn = listeners.get(type);
      if (!fn) throw new Error(`the worker never registered a "${type}" listener`);
      const withWaitUntil = {
        ...(event as Record<string, unknown>),
        waitUntil: (p: Promise<unknown>) => {
          pending = p;
        },
      };
      fn(withWaitUntil);
      await pending;
      pending = Promise.resolve();
    },
  } as Harness;
}

export function payload(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    title: 'Ready to watch',
    body: 'Dune is now in your library.',
    link: '/movie/ab12',
    imageUrl: 'https://img.example/p.jpg',
    actions: [{ id: 'watch', label: 'Watch', kind: 'link', href: '/movie/ab12' }],
    ...over,
  };
}

export const pushEvent = (data: unknown) => ({ data: { json: () => data } });

export function shownAt(sw: Harness, n = 0): Shown {
  const found = sw.shown[n];
  if (!found) throw new Error(`the worker showed ${sw.shown.length} notifications, wanted #${n}`);
  return found;
}

export function fetchAt(sw: Harness, n = 0): { url: string; init?: RequestInit } {
  const found = sw.fetches[n];
  if (!found) throw new Error(`the worker made ${sw.fetches.length} requests, wanted #${n}`);
  return found;
}
