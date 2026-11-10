import { existsSync, readFileSync } from 'node:fs';
import { VersionHistory } from '@kromatv/registry';
import type { z } from 'zod';
import { Catalog } from '../bundle/catalog';

/** The live catalog `kroma release` compares against unless told otherwise. */
export const DEFAULT_CATALOG = 'https://modules.kroma.tv/modules.json';

/** The rolling release the catalog and the version history are published on. */
export const REGISTRY_RELEASE = 'modules';

/** Where a repository's release train keeps its version history. */
export function defaultHistory(repo: string): string {
  return `https://github.com/${repo}/releases/download/${REGISTRY_RELEASE}/history.json`;
}

async function load<T>(source: string, schema: z.ZodType<T>, flag: string): Promise<T | null> {
  if (!/^https?:\/\//.test(source)) {
    if (!existsSync(source)) throw new Error(`${flag} ${source} does not exist`);
    return schema.parse(JSON.parse(readFileSync(source, 'utf8')));
  }
  const res = await fetch(source, { headers: { 'user-agent': 'kroma-cli' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
  return schema.parse(await res.json());
}

/** The catalog servers are being served now. Nothing published yet reads as an
 *  empty catalog, so every module is a first release. */
export async function loadPublished(source: string): Promise<Catalog> {
  const catalog = await load(source, Catalog, '--published');
  if (catalog) return catalog;
  console.warn(`  ! ${source} is 404: treating every module as a first release`);
  return { schema: 2, modules: [] };
}

/** Every version published so far, or `null` when there is no history yet. A
 *  history that is there but unreadable fails the run, so it is never replaced by
 *  one that forgot it. */
export async function loadHistory(source: string): Promise<VersionHistory | null> {
  const history = await load(source, VersionHistory, '--published-history');
  if (!history) console.warn(`  ! ${source} is 404: starting the version history afresh`);
  return history;
}
