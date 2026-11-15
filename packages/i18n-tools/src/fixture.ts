import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Project } from '@kromatv/i18n/model';
import type { CatalogSet, Layout } from './set.ts';
import { moduleSet } from './workspace.ts';

const made: string[] = [];

type Files = Record<string, Record<string, string>>;

function tree(files: Files): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-i18n-tools-'));
  made.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `${JSON.stringify(content, null, 2)}\n`);
  }
  return dir;
}

const FRENCH: Project = { source: 'fr' };

/** A catalog set on disk, from a map of path to content, for a test. */
export function setOf(
  files: Files,
  project: Project = FRENCH,
  layout: Layout = 'folder',
): CatalogSet {
  return { name: 'app', dir: tree(files), layout, project };
}

/** A module with a front end on disk, from a map of path to content under
 *  its root, as the set its `locales/` make. */
export function moduleOf(files: Files): CatalogSet {
  const dir = tree(files);
  mkdirSync(join(dir, 'ui', 'src'), { recursive: true });
  return moduleSet('tv.acme.notes', dir, { source: 'en' });
}

export function read(set: CatalogSet, path: string): Record<string, string> {
  return JSON.parse(readFileSync(join(set.dir, path), 'utf8')) as Record<string, string>;
}

export function write(set: CatalogSet, path: string, content: Record<string, string>): void {
  mkdirSync(dirname(join(set.dir, path)), { recursive: true });
  writeFileSync(join(set.dir, path), `${JSON.stringify(content, null, 2)}\n`);
}

export function has(set: CatalogSet, path: string): boolean {
  return existsSync(join(set.dir, path));
}

export function removeSets(): void {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
