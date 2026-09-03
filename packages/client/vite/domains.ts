// Two jobs, both of which need a static list and neither of which a bundler
// glob can do: re-export each domain for consumers, and IMPORT each domain's
// `client.ts` so its `Domains` augmentation is in a consumer's program. A
// re-export does not load the client, and `import.meta.glob` /
// `require.context` are resolutions the type checker cannot follow.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

export const INDEX_FILE = 'index.ts';

interface Domain {
  name: string;
  hasClient: boolean;
}

function scanDomains(root: string): Domain[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      hasClient: readdirSync(`${root}${sep}${entry.name}`).includes('client.ts'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The index's text for the domains given. */
export function domainIndex(domains: readonly Domain[]): string {
  const lines = [
    '// Written by @kroma/client/vite from the folders in src/api. Not committed,',
    '// not hand-edited: adding a domain is adding a folder.',
    '',
    ...domains.filter((d) => d.hasClient).map((d) => `import './${d.name}/client';`),
    '',
    ...domains.map((d) => `export * from './${d.name}';`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Write `<dir>/index.ts`, reporting whether it moved. */
export function writeDomainIndex(dir: string): { path: string; changed: boolean } {
  const root = resolve(dir);
  const path = `${root}${sep}${INDEX_FILE}`;
  const next = domainIndex(scanDomains(root));
  const current = (() => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return '';
    }
  })();
  if (current === next) return { path, changed: false };
  writeFileSync(path, next);
  return { path, changed: true };
}

/** Keeps the domain index in step under the dev server, where a folder can
 *  appear while Vite is running. A build or a test run reads what
 *  `bun run gen:types` wrote, and the index is only written here if it is
 *  missing: writing a source file on every config resolve churns the module
 *  graph of anything that resolves one. */
export function domains({ dir }: { dir: string }): Plugin {
  const root = resolve(dir);
  const within = (file: string) => file.startsWith(`${root}${sep}`);

  return {
    name: 'kroma:domains',
    apply: 'serve',
    configResolved() {
      if (!existsSync(`${root}${sep}${INDEX_FILE}`)) writeDomainIndex(root);
    },
    configureServer(server) {
      for (const event of ['add', 'unlink'] as const) {
        server.watcher.on(event, (file) => {
          if (within(file) && file.endsWith('.ts')) writeDomainIndex(root);
        });
      }
    },
  };
}
