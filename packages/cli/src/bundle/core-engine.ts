import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CoreScope } from '@kromatv/registry';
import { z } from 'zod';
import { CLI_ROOT, repoRoot } from '../scaffold/plan';

const TABLE_VERSIONS_FILE = 'table_versions.json';
const IN_REPO = join('server', 'crates', 'kroma-db', 'src', 'schema', TABLE_VERSIONS_FILE);

const Version = z.number().int().positive();

/**
 * The core schema's history per table, as the server's own tests derive it:
 * the version the schema is at, and for each table the versions that last
 * changed it and last changed it in a way a module built before reads wrongly.
 */
export const TableVersions = z.object({
  version: Version,
  tables: z.record(
    z.string(),
    z.object({ changed: Version, broke: Version, dropped: z.boolean().optional() }),
  ),
});
export type TableVersions = z.infer<typeof TableVersions>;

/** The core schema this CLI was built with: shipped beside it in the SDK, read
 *  from the server's tree in this repository. */
export function readTableVersions(): TableVersions {
  const shipped = join(CLI_ROOT, TABLE_VERSIONS_FILE);
  const repo = repoRoot(CLI_ROOT);
  const path = existsSync(shipped) || !repo ? shipped : join(repo, IN_REPO);
  return TableVersions.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function tablesOf(scope: CoreScope | null | undefined): string[] {
  const entries = [...(scope?.read ?? []), ...(scope?.write ?? [])];
  const tables = entries.map((entry) => (entry.split('.')[0] ?? '').trim().toLowerCase());
  return [...new Set(tables.filter(Boolean))];
}

function unknownTables(tables: readonly string[], versions: TableVersions): string[] {
  return tables.filter((table) => {
    const known = versions.tables[table];
    return !known || known.dropped === true;
  });
}

function unknownProblem(unknown: readonly string[], versions: TableVersions): string {
  const named = unknown.map((table) => `"${table}"`).join(', ');
  return `storage.core names ${named}, which the core schema at version ${versions.version} has no table of`;
}

/**
 * The oldest core schema a module whose grant is `scope` runs on: the newest of
 * the versions that last changed a table it names. `null` for a module that
 * reaches none of the core database. Throws for a table the core schema does
 * not have.
 */
export function coreSchemaFor(
  scope: CoreScope | null | undefined,
  versions: TableVersions,
): number | null {
  const tables = tablesOf(scope);
  if (tables.length === 0) {
    return null;
  }
  const unknown = unknownTables(tables, versions);
  if (unknown.length > 0) {
    throw new Error(unknownProblem(unknown, versions));
  }
  return Math.max(...tables.map((table) => versions.tables[table]?.changed ?? 0));
}

/** {@link coreSchemaFor} against the core schema this CLI was built with, read
 *  only for a module that has a grant. */
export function coreSchemaOf(scope: CoreScope | null | undefined): number | null {
  return tablesOf(scope).length === 0 ? null : coreSchemaFor(scope, readTableVersions());
}

/** Why a grant cannot be built, before anything is: it names a table the core
 *  schema this CLI was built with does not have. `null` when it names none. */
export function coreGrantProblem(scope: CoreScope | null | undefined): string | null {
  const tables = tablesOf(scope);
  if (tables.length === 0) {
    return null;
  }
  const versions = readTableVersions();
  const unknown = unknownTables(tables, versions);
  return unknown.length > 0 ? unknownProblem(unknown, versions) : null;
}
