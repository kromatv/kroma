import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_SCHEMA_VERSION } from '@kroma/registry';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from '../project';
import { buildFrontend } from './build';

const REPO = fileURLToPath(new URL('../../../..', import.meta.url));

let dir = '';

function write(rel: string, body: string): void {
  const at = join(dir, rel);
  mkdirSync(join(at, '..'), { recursive: true });
  writeFileSync(at, body);
}

function bare(): string {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'kroma-fe-')));
  write(
    'module.json',
    JSON.stringify({
      schemaVersion: MODULE_SCHEMA_VERSION,
      id: 'tv.acme.notes',
      name: 'Notes',
      version: '0.1.0',
    }),
  );
  write('locales/en.json', JSON.stringify({ title: 'Notes' }));
  return dir;
}

function withPage(): string {
  bare();
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'));
  write(
    'ui/src/module.tsx',
    [
      "import { defineModule } from '@kroma/module-sdk';",
      "import { lazy } from 'react';",
      '',
      'export default defineModule({',
      "  routes: [{ path: 'notes', element: lazy(() => import('./page')) }],",
      '});',
      '',
    ].join('\n'),
  );
  write(
    'ui/src/page.tsx',
    [
      "import { Button } from '@kroma/ui/kit';",
      '',
      'export default function NotesPage() {',
      '  return Button;',
      '}',
      '',
    ].join('\n'),
  );
  return dir;
}

function emitted(out: string): string {
  return readdirSync(out, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'))
    .join('\n');
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('buildFrontend', () => {
  it('builds a remote entry that reads its packages off the host global', async () => {
    const project = openProject(withPage());
    const out = join(dir, 'dist', 'fe');

    const built = await buildFrontend(project, out, 'production');

    const entry = readFileSync(join(out, 'remoteEntry.js'), 'utf8');
    expect(built).toBe(true);
    expect(entry).toContain('("@kroma/module-sdk")');
    expect(entry).toContain('("react")');
    expect(emitted(out)).toContain('("@kroma/ui/kit")');
    expect(emitted(out)).toContain('__KROMA_SHARED__');
  }, 60_000);

  it('hands the entry the manifest and the locale catalogs beside it', async () => {
    const project = openProject(withPage());
    const out = join(dir, 'dist', 'fe');

    await buildFrontend(project, out, 'production');

    const entry = readFileSync(join(out, 'remoteEntry.js'), 'utf8');
    expect(entry).toContain('tv.acme.notes');
    expect(entry).toContain('locales/en.json');
  }, 60_000);

  it('carries none of the packages the host provides, React least of all', async () => {
    const project = openProject(withPage());
    const out = join(dir, 'dist', 'fe');

    await buildFrontend(project, out, 'production');

    const all = emitted(out);
    expect(all).not.toContain('__SECRET_INTERNALS');
    expect(all).not.toContain('createElement');
    expect(all).not.toContain('react-dom');
    expect(all.length).toBeLessThan(5_000);
  }, 60_000);

  it('builds nothing for a module that has no page', async () => {
    const project = openProject(bare());
    const out = join(dir, 'dist', 'fe');

    const built = await buildFrontend(project, out, 'production');

    expect(built).toBe(false);
    expect(existsSync(out)).toBe(false);
  });
});
