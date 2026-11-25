import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { type CatalogSet, catalogPath, localesOf, readCatalogs, WHOLE } from './set.ts';

/** What a file said on the base branch, the one this work started from, or
 *  `null` where that cannot be told. */
export type BaseFile = (path: string) => string | null;

const MANIFEST = 'module.json';

function manifestOf(set: CatalogSet): string {
  return join(dirname(set.dir), MANIFEST);
}

function bundled(set: CatalogSet): string {
  const catalogs =
    set.layout === 'folder'
      ? readCatalogs(set)
      : localesOf(set).map((locale) => [
          locale,
          readFileSync(catalogPath(set, locale, WHOLE), 'utf8'),
        ]);
  return JSON.stringify(catalogs);
}

/** What the bundle of every module among `sets` carries of its messages: a
 *  set is a module's where a `module.json` sits beside its `locales/`. */
export function shippedCatalogs(sets: readonly CatalogSet[]): ReadonlyMap<CatalogSet, string> {
  return new Map(
    sets.filter((set) => existsSync(manifestOf(set))).map((set) => [set, bundled(set)]),
  );
}

const Manifest = z.looseObject({ version: z.string() });

function versionOf(manifest: string): string | null {
  try {
    return Manifest.parse(JSON.parse(manifest)).version;
  } catch {
    return null;
  }
}

const PATCH = /^(\d+\.\d+\.)(\d+)$/;

function nextPatch(version: string): string | null {
  const [, head, patch] = PATCH.exec(version) ?? [];
  return head === undefined || patch === undefined ? null : `${head}${Number(patch) + 1}`;
}

const VERSION_FIELD = /("version"\s*:\s*)"[^"]*"/;

function bump(set: CatalogSet, atBase: BaseFile): string | null {
  const path = manifestOf(set);
  const text = readFileSync(path, 'utf8');
  const version = versionOf(text);
  const next = version === null ? null : nextPatch(version);
  if (next === null) {
    return null;
  }
  const base = atBase(path);
  if (base === null || versionOf(base) !== version) {
    return null;
  }
  writeFileSync(
    path,
    text.replace(VERSION_FIELD, (_field, key: string) => `${key}"${next}"`),
  );
  return `${set.name} ${version} -> ${next}`;
}

/**
 * Move by one patch the `version` of every module whose bundled messages are
 * no longer what `before` holds, so a translation ships. Once per branch: a
 * version already past the one `atBase` gives stays, and a module with no
 * base, outside git or new on the branch, is left alone. The rest of the
 * manifest is kept as it is written. Returns one line per module moved.
 */
export function bumpVersions(before: ReadonlyMap<CatalogSet, string>, atBase: BaseFile): string[] {
  return [...before]
    .filter(([set, shipped]) => bundled(set) !== shipped)
    .flatMap(([set]) => bump(set, atBase) ?? []);
}
