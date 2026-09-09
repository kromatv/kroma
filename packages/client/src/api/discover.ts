import { type DomainFactory, domainKey } from '../core/client';

// The Metro half; `discover.web.ts` beside it is Vite's. `require.context` is
// Metro's glob, expanded at build time from the literal call below.
interface MetroContext {
  keys(): string[];
  (key: string): { default: DomainFactory };
}

interface MetroIndexContext {
  keys(): string[];
  (key: string): unknown;
}

declare const require: {
  context(directory: string, recursive: boolean, filter: RegExp): MetroContext & MetroIndexContext;
};

function every(): Record<string, DomainFactory> {
  const context = require.context('.', true, /\/client\.ts$/);
  const found: Record<string, DomainFactory> = {};
  for (const key of context.keys()) found[domainKey(key)] = context(key).default;
  return found;
}

export const domains: Readonly<Record<string, DomainFactory>> = every();

function everyIndex(): Record<string, unknown> {
  const context = require.context('.', true, /\/index\.ts$/);
  const found: Record<string, unknown> = {};
  for (const key of context.keys()) found[domainKey(key)] = context(key);
  return found;
}

/** Every domain's public module (`@kromatv/client/<domain>`) by domain name, for
 *  a host that hands them to code it loads at runtime. */
export const domainModules: Readonly<Record<string, unknown>> = everyIndex();
