import { type DomainFactory, domainKey } from '../core/client';

// The Vite half; `discover.ts` beside it is Metro's. Written out in full and
// cast in place: Vite finds `import.meta.glob(...)` by matching the literal
// text, and this package keeps `vite/client` types out.
interface GlobHost {
  glob(pattern: string, options: { eager: true; import: 'default' }): Record<string, DomainFactory>;
}

const modules = (import.meta as unknown as GlobHost).glob('./*/client.ts', {
  eager: true,
  import: 'default',
});

export const domains: Readonly<Record<string, DomainFactory>> = Object.fromEntries(
  Object.entries(modules).map(([path, factory]) => [domainKey(path), factory]),
);
