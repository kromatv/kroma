// Build the RFC-110 documents from catalog entries. Pure: entries in, JSON-able
// values out, so both the publish pipeline and the reference registry's worker
// derive the same bytes from the same input.

import {
  type ModuleRecord,
  REGISTRY_API_VERSION,
  type RegistryDescriptor,
  type RegistryEntry,
  type RegistryVersion,
} from './documents/index.ts';
import { type DescribedModule, dependenciesOf, optionalDependenciesOf } from './manifest/index.ts';
import { channelOf } from './semver.ts';
import { byCodeUnit } from './sort.ts';
import { base64 } from './text.ts';

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/** A hex sha256 (what the packer records) as a Subresource-Integrity string, or
 *  `null` when the input is not one - an artifact nothing vouches for is dropped
 *  rather than described with an integrity a client cannot check. */
export function sriFromHex(hexSha256: string | null | undefined): string | null {
  if (!hexSha256 || !HEX_SHA256.test(hexSha256)) return null;
  const bytes = hexSha256.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
  return `sha256-${base64(Uint8Array.from(bytes))}`;
}

const some = <T>(list: T[] | null | undefined) => (list && list.length > 0 ? list : undefined);
const someMap = (map: Record<string, string>) => (Object.keys(map).length > 0 ? map : undefined);

// Explicit manifest tags, else the capability kinds it provides, so a store can
// filter by "download-client" without hand-authored tags.
function tagsOf(entry: DescribedModule): string[] | undefined {
  const explicit = some(entry.tags);
  if (explicit) return explicit;
  const kinds = (entry.provides ?? [])
    .map((p) => (p && typeof p === 'object' ? (p as { kind?: string }).kind : undefined))
    .filter((k): k is string => typeof k === 'string');
  return some([...new Set(kinds)]);
}

function metaOf(entry: DescribedModule) {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    author: entry.author,
    homepage: entry.homepage,
    license: entry.license,
    keywords: some(entry.keywords),
    tags: tagsOf(entry),
    icon: entry.icon,
  };
}

function versionOf(entry: DescribedModule): RegistryVersion {
  return {
    schemaVersion: entry.schemaVersion,
    engines: entry.engines,
    library: entry.library,
    dependencies: someMap(dependenciesOf(entry)),
    optionalDependencies: someMap(optionalDependenciesOf(entry)),
    provides: some(entry.provides),
    requires: some(entry.requires),
    artifacts: entry.artifacts.flatMap((a) => {
      const integrity = sriFromHex(a.sha256);
      if (!integrity) return [];
      return [
        {
          target: a.target,
          url: a.url,
          size: a.size,
          integrity,
          contentHash: sriFromHex(a.contentHash),
        },
      ];
    }),
  };
}

/** The versions a registry already serves for a module, folded under the one
 *  being published. */
export type KnownVersions = Partial<Pick<ModuleRecord, 'versions' | 'distTags'>>;

/** One module's full record. `known` folds this version into the versions a
 *  registry already publishes, so republishing does not drop history. */
export function buildModuleRecord(entry: DescribedModule, known?: KnownVersions): ModuleRecord {
  const versions = { ...known?.versions, [entry.version]: versionOf(entry) };
  const channel = channelOf(entry.version);
  const distTags = { ...known?.distTags, ...(channel ? { [channel]: entry.version } : {}) };
  return {
    apiVersion: REGISTRY_API_VERSION,
    ...metaOf(entry),
    latest: distTags.latest ?? entry.version,
    distTags,
    versions,
  };
}

/** `GET /index.json`, sorted by id so the same module set produces the same bytes. */
export function buildIndex(entries: DescribedModule[]): RegistryEntry[] {
  return entries
    .map((entry) => ({ ...metaOf(entry), version: entry.version, ...versionOf(entry) }))
    .sort((a, b) => byCodeUnit(a.id, b.id));
}

/** `GET /registry.json`. `url` is the registry's own root, not the bundle host. */
export function buildDescriptor(
  name: string,
  url: string,
  entries: DescribedModule[],
): RegistryDescriptor {
  return {
    apiVersion: REGISTRY_API_VERSION,
    name,
    url,
    modules: entries.map((e) => e.id).sort(byCodeUnit),
  };
}
