// A typed client for any RFC-110 registry. Transport is injected (a `fetchJson`),
// so resolution, channel selection and integrity are testable without a network
// and the same client runs under Bun, Node and workerd.

import {
  ModuleRecord,
  REGISTRY_API_VERSION,
  RegistryDescriptor,
  type RegistryEntry,
  RegistryIndex,
  type RegistryVersion,
} from './documents/index.ts';
import { compareRaw, satisfies } from './semver.ts';
import { base64, trimTrailingSlashes } from './text.ts';

export type FetchJson = (url: string) => Promise<unknown>;

/** A reverse-DNS module id. Checked before it reaches a URL: an id is
 *  registry-supplied, and `../` in one would walk out of `/m/`. */
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;

/** The highest version satisfying `range`, or `null`. */
export function pickVersion(versions: string[], range: string): string | null {
  const ok = versions.filter((v) => satisfies(v, range)).sort(compareRaw);
  return ok.at(-1) ?? null;
}

/** Verify bytes against an `sha256-<base64>` integrity string. */
export async function verifyIntegrity(bytes: Uint8Array, integrity: string): Promise<boolean> {
  const [algo, expected] = [integrity.slice(0, 7), integrity.slice(7)];
  if (algo !== 'sha256-' || !expected) return false;
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const actual = base64(new Uint8Array(digest));
  return actual === expected;
}

/** What a substring search reads: everything a store card puts on screen. */
export type Searchable = Pick<RegistryEntry, 'id' | 'name' | 'description' | 'keywords' | 'tags'>;

/** Substring match over everything a store card shows. */
export function matches(entry: Searchable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    entry.id,
    entry.name,
    entry.description ?? '',
    ...(entry.keywords ?? []),
    ...(entry.tags ?? []),
  ].some((field) => field.toLowerCase().includes(q));
}

export interface Resolved {
  version: string;
  release: RegistryVersion;
}

export interface RegistryClient {
  descriptor(): Promise<RegistryDescriptor>;
  index(): Promise<RegistryEntry[]>;
  module(id: string): Promise<ModuleRecord>;
  search(query: string): Promise<RegistryEntry[]>;
  /** The version a `range` (or a channel name like `beta`) installs to. */
  resolve(id: string, range: string): Promise<Resolved | null>;
}

function checkApiVersion(apiVersion: number, what: string): void {
  if (apiVersion > REGISTRY_API_VERSION) {
    throw new Error(
      `${what} declares registry apiVersion ${apiVersion}; this client speaks ${REGISTRY_API_VERSION}`,
    );
  }
}

export function createRegistryClient(baseUrl: string, fetchJson: FetchJson): RegistryClient {
  const base = trimTrailingSlashes(baseUrl);
  const record = async (id: string): Promise<ModuleRecord> => {
    if (!ID.test(id)) throw new Error(`'${id}' is not a module id`);
    const parsed = ModuleRecord.parse(await fetchJson(`${base}/m/${encodeURIComponent(id)}.json`));
    checkApiVersion(parsed.apiVersion, id);
    return parsed;
  };
  return {
    async descriptor() {
      const parsed = RegistryDescriptor.parse(await fetchJson(`${base}/registry.json`));
      checkApiVersion(parsed.apiVersion, base);
      return parsed;
    },
    async index() {
      return RegistryIndex.parse(await fetchJson(`${base}/index.json`));
    },
    module: record,
    async search(query) {
      const index = RegistryIndex.parse(await fetchJson(`${base}/index.json`));
      return index.filter((entry) => matches(entry, query));
    },
    async resolve(id, range) {
      const found = await record(id);
      // A channel name resolves straight to its version; anything else is a range.
      const version = found.distTags[range] ?? pickVersion(Object.keys(found.versions), range);
      const release = version ? found.versions[version] : undefined;
      return version && release ? { version, release } : null;
    },
  };
}
