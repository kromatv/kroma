import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { domains } from './domains.ts';

/** The domain folders `KromaClient` is assembled from, one per namespace. */
export const CLIENT_API = fileURLToPath(new URL('../src/api/', import.meta.url));

/** The domain index, wired into a Vite build. `kroma()` loads it for every
 *  shell; Metro reads the file `bun run gen:types` wrote. */
export function kromaDomains(): Plugin {
  return domains({ dir: CLIENT_API });
}

export { domainIndex, writeDomainIndex } from './domains.ts';
