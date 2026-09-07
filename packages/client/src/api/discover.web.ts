import { type DomainFactory, domainKey } from '../core/client';

// The Vite half; `discover.ts` beside it is Metro's. Written out in full and
// cast in place: Vite finds `import.meta.glob(...)` by matching the literal
// text, and this package keeps `vite/client` types out.
interface GlobHost {
  glob(pattern: string, options: { eager: true; import: 'default' }): Record<string, DomainFactory>;
  glob(pattern: string, options: { eager: true }): Record<string, unknown>;
}

const modules = (import.meta as unknown as GlobHost).glob('./*/client.ts', {
  eager: true,
  import: 'default',
});

export const domains: Readonly<Record<string, DomainFactory>> = Object.fromEntries(
  Object.entries(modules).map(([path, factory]) => [domainKey(path), factory]),
);

const indexes = (import.meta as unknown as GlobHost).glob('./*/index.ts', { eager: true });

/** Every domain's public module (`@kroma/client/<domain>`) by domain name, for
 *  a host that hands them to code it loads at runtime. */
export const domainModules: Readonly<Record<string, unknown>> = Object.fromEntries(
  Object.entries(indexes).map(([path, mod]) => [domainKey(path), mod]),
);
