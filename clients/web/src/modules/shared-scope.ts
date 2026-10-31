import { domainModules } from '@kromatv/client';
import {
  SHARED_GLOBAL,
  SHARED_MODULES,
  type SharedModule,
  WHOLE_NAMESPACE,
} from '@kromatv/module-sdk';
import { z } from 'zod';

/** What a module's entry reads from the host as it loads, as its build wrote it
 *  beside the entry (`REMOTE_SHARED`). */
export const EntryReads = z.record(z.string(), z.array(z.string()));
export type EntryReads = z.infer<typeof EntryReads>;

/** What the host hands a runtime-loaded module, by the specifier its source
 *  imported. Loaded on demand: a page with no module installed pays nothing.
 *  A workspace barrel goes through a one-line re-export in `scope/`: the app
 *  imports these barrels statically, and a namespace `import()` of a module
 *  the app also imports keeps every export of it alive in the app's own chunk,
 *  which put the whole kit and the player on first paint. */
const PROVIDERS: Record<SharedModule, () => Promise<unknown>> = {
  react: () => import('react'),
  'react/jsx-runtime': () => import('react/jsx-runtime'),
  'react/jsx-dev-runtime': () => import('react/jsx-dev-runtime'),
  'react-dom': () => import('react-dom'),
  'react-native': () => import('react-native'),
  '@kromatv/module-sdk': () => import('#web/modules/scope/module-sdk'),
  '@kromatv/ui': () => import('#web/modules/scope/ui'),
  '@kromatv/ui/kit': () => import('#web/modules/scope/ui-kit'),
  '@kromatv/ui/tokens': () => import('#web/modules/scope/ui-tokens'),
  '@kromatv/core': () => import('#web/modules/scope/core'),
  '@kromatv/core/react': () => import('#web/modules/scope/core-react'),
  '@kromatv/client': () => import('#web/modules/scope/client'),
  '@kromatv/client/query': () => import('#web/modules/scope/client-query'),
  '@kromatv/i18n': () => import('#web/modules/scope/i18n'),
  '@kromatv/i18n/react': () => import('#web/modules/scope/i18n-react'),
  '@tanstack/react-query': () => import('@tanstack/react-query'),
  '@tanstack/react-router': () => import('@tanstack/react-router'),
  'react-call': () => import('react-call'),
};

interface StandIn {
  names: readonly string[];
  load: () => Promise<unknown>;
}

const STAND_INS: Partial<Record<SharedModule, StandIn>> = {
  '@kromatv/module-sdk': {
    names: ['defineModule', 'pageHref'],
    load: () => import('#web/modules/scope/module-sdk-entry'),
  },
};

const CLIENT_DOMAIN = '@kromatv/client/';

const isShared = (key: string): key is SharedModule =>
  (SHARED_MODULES as readonly string[]).includes(key);

/** Everything a runtime module imports from the host, keyed by specifier. */
export async function provideShared(): Promise<Record<string, unknown>> {
  const loaded = await Promise.all(
    Object.entries(PROVIDERS).map(async ([key, load]) => [key, await load()] as const),
  );
  const shared: Record<string, unknown> = Object.fromEntries(loaded);
  for (const [domain, mod] of Object.entries(domainModules)) {
    shared[`${CLIENT_DOMAIN}${domain}`] = mod;
  }
  return shared;
}

async function provide(key: string, names: ReadonlySet<string>): Promise<unknown> {
  if (key.startsWith(CLIENT_DOMAIN)) return domainModules[key.slice(CLIENT_DOMAIN.length)];
  if (!isShared(key)) return undefined;
  const standIn = STAND_INS[key];
  const light =
    standIn !== undefined &&
    [...names].every((name) => name !== WHOLE_NAMESPACE && standIn.names.includes(name));
  return light ? standIn.load() : PROVIDERS[key]();
}

/** Just what the entries read: a package they take only light names from comes
 *  as its stand-in, any other read as the real module. */
export async function provideEntryShared(
  reads: readonly EntryReads[],
): Promise<Record<string, unknown>> {
  const wanted = new Map<string, Set<string>>();
  for (const declared of reads) {
    for (const [key, names] of Object.entries(declared)) {
      wanted.set(key, new Set([...(wanted.get(key) ?? []), ...names]));
    }
  }
  const loaded = await Promise.all(
    [...wanted].map(async ([key, names]) => [key, await provide(key, names)] as const),
  );
  return Object.fromEntries(loaded.filter(([, mod]) => mod !== undefined));
}

/** Put `entries` on the global a module bundle reads. A full set replaces what
 *  is there; a stand-in never displaces the real module. */
export function installShared(entries: Record<string, unknown>, full: boolean): void {
  const current: unknown = Reflect.get(globalThis, SHARED_GLOBAL);
  const held = current !== null && typeof current === 'object' ? current : {};
  Reflect.set(globalThis, SHARED_GLOBAL, full ? { ...held, ...entries } : { ...entries, ...held });
}
