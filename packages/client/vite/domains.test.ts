import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { domainIndex, domains, INDEX_FILE, writeDomainIndex } from './domains.ts';

interface Hooks {
  name: string;
  apply: string;
  configResolved: () => void;
  configureServer: (server: { watcher: Watcher }) => void;
}

type Listener = (file: string) => void;

class Watcher {
  private readonly listeners = new Map<string, Listener[]>();
  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, file: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener(file);
  }
}

const roots: string[] = [];

function apiTree(folders: Readonly<Record<string, readonly string[]>>): string {
  const root = mkdtempSync(join(tmpdir(), 'kroma-domains-'));
  roots.push(root);
  for (const [folder, files] of Object.entries(folders)) {
    mkdirSync(join(root, folder));
    for (const file of files) writeFileSync(join(root, folder, file), '');
  }
  return root;
}

const indexOf = (root: string) => readFileSync(join(root, INDEX_FILE), 'utf8');

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('the domain index', () => {
  it('imports a domain that has a client, for the augmentation a re-export would not load', () => {
    const text = domainIndex([{ name: 'media', hasClient: true }]);

    expect(text).toContain("import './media/client';");
    expect(text).toContain("export * from './media';");
  });

  it('re-exports a domain with no client without importing one', () => {
    const text = domainIndex([{ name: 'events', hasClient: false }]);

    expect(text).toContain("export * from './events';");
    expect(text).not.toContain("import './events/client';");
  });

  it('keeps the folders in one order, so the file does not churn', () => {
    const folders = [
      { name: 'media', hasClient: true },
      { name: 'accounts', hasClient: true },
    ];

    expect(domainIndex(folders)).toBe(domainIndex(folders));
  });
});

describe('writing the index for a tree', () => {
  it('imports the client of the folder that has one and re-exports both', () => {
    const root = apiTree({ media: ['client.ts', 'schemas.ts'], events: ['socket.ts'] });

    writeDomainIndex(root);

    expect(indexOf(root)).toContain("import './media/client';");
    expect(indexOf(root)).not.toContain("import './events/client';");
    expect(indexOf(root)).toContain("export * from './events';\nexport * from './media';\n");
  });

  it('reports the file it wrote, and reports no change on a second pass', () => {
    const root = apiTree({ media: ['client.ts'] });

    const written = writeDomainIndex(root);
    const again = writeDomainIndex(root);

    expect(written).toEqual({ path: join(root, INDEX_FILE), changed: true });
    expect(again.changed).toBe(false);
  });

  it('rewrites once a folder appears', () => {
    const root = apiTree({ media: ['client.ts'] });
    writeDomainIndex(root);

    mkdirSync(join(root, 'cast'));
    writeFileSync(join(root, 'cast', 'client.ts'), '');

    expect(writeDomainIndex(root).changed).toBe(true);
    expect(indexOf(root)).toContain("import './cast/client';");
  });
});

describe('the dev-server plugin', () => {
  const hooks = (dir: string) => domains({ dir }) as unknown as Hooks;

  it('writes the index the dev server is missing, and leaves a stale one alone', () => {
    const missing = apiTree({ media: ['client.ts'] });
    const stale = apiTree({ media: ['client.ts'] });
    writeFileSync(join(stale, INDEX_FILE), '// mine\n');

    hooks(missing).configResolved();
    hooks(stale).configResolved();

    expect(indexOf(missing)).toContain("import './media/client';");
    expect(indexOf(stale)).toBe('// mine\n');
  });

  it('rewrites when a domain file appears or goes under the dev server', () => {
    const root = apiTree({ media: ['client.ts'] });
    const watcher = new Watcher();
    hooks(root).configureServer({ watcher });

    mkdirSync(join(root, 'cast'));
    writeFileSync(join(root, 'cast', 'client.ts'), '');
    watcher.emit('add', join(root, 'cast', 'client.ts'));

    expect(indexOf(root)).toContain("import './cast/client';");
  });

  it('ignores a file outside the tree and one that is not TypeScript', () => {
    const root = apiTree({ media: ['client.ts'] });
    const watcher = new Watcher();
    hooks(root).configureServer({ watcher });

    watcher.emit('add', join(root, 'media', 'notes.md'));
    watcher.emit('unlink', join(tmpdir(), 'elsewhere.ts'));

    expect(() => indexOf(root)).toThrow();
  });

  it('names itself and runs only under the dev server', () => {
    const plugin = hooks(apiTree({ media: ['client.ts'] }));

    expect(plugin.name).toBe('kroma:domains');
    expect(plugin.apply).toBe('serve');
  });
});
