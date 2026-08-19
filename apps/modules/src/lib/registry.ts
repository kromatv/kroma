// What the registry SERVES. Where each document lives is `lib/api.ts`'s job;
// this module only turns the merged catalog into the RFC 110 documents.

import {
  buildDescriptor,
  buildIndex,
  buildModuleRecord,
  type DescribedModule,
  jsonSchema,
  publishesSchema,
  SCHEMA_NAMES,
  type SchemaName,
} from '@kroma/registry';
import type { ModuleEntry } from '#site/catalog';
import { releaseHistory } from '#site/lib/releases';
import { type Env, jsonResponse, loadCatalog } from '#site/lib/source';

const REGISTRY_NAME = 'KROMA modules';

const SCHEMA_TTL = 86_400;
const DOCUMENT_TTL = 300;
const MISS_TTL = 60;

type WaitUntil = (p: Promise<unknown>) => void;

// The site's schema nulls a url or size it would not put on a page; a registry
// may not offer an artifact with no https url at all, so those are dropped here
// rather than described.
function described(m: ModuleEntry): DescribedModule {
  return {
    ...m,
    artifacts: m.artifacts.flatMap((a) => (a.url ? [{ ...a, url: a.url, size: a.size ?? 0 }] : [])),
  };
}

/** The merged catalog as the documents are built from, or `null` when it cannot
 *  be read - which is a 503, never an empty registry: those must not look alike
 *  to an installer. */
async function modules(env: Env, waitUntil: WaitUntil): Promise<DescribedModule[] | null> {
  const body = await loadCatalog(env, waitUntil);
  const { parseCatalog } = await import('#site/catalog');
  const catalog = body ? parseCatalog(body) : null;
  return catalog ? catalog.modules.map(described) : null;
}

const unavailable = () =>
  jsonResponse(JSON.stringify({ error: 'catalog unavailable' }), MISS_TTL, 503);

/** `GET /registry.json` — who this registry is and which ids it serves. */
export async function descriptorResponse(env: Env, waitUntil: WaitUntil, origin: string) {
  const found = await modules(env, waitUntil);
  if (!found) return unavailable();
  return jsonResponse(JSON.stringify(buildDescriptor(REGISTRY_NAME, origin, found)), DOCUMENT_TTL);
}

/** `GET /index.json` — one record per module, the version a bare install gets. */
export async function indexResponse(env: Env, waitUntil: WaitUntil) {
  const found = await modules(env, waitUntil);
  if (!found) return unavailable();
  return jsonResponse(JSON.stringify(buildIndex(found)), DOCUMENT_TTL);
}

/** `GET /m/{id}.json` — one module, every version. */
export async function moduleResponse(id: string, env: Env, waitUntil: WaitUntil) {
  const found = await modules(env, waitUntil);
  if (!found) return unavailable();
  const entry = found.find((m) => m.id === id);
  if (!entry) return jsonResponse(JSON.stringify({ error: 'no such module' }), MISS_TTL, 404);
  // Only the full record carries history: the catalog names the current version
  // of each module, the releases hold every version ever cut.
  const known = (await releaseHistory(env, waitUntil))[id];
  return jsonResponse(JSON.stringify(buildModuleRecord(entry, known)), DOCUMENT_TTL);
}

/** `GET /schemas/{version}/{name}.json` — the spec, derived from the schemas this
 *  registry emits with, so it is served without reading the catalog at all.
 *  `null` when nothing publishes that name at that version. */
export function schemaResponse(name: string, version: number | undefined, origin: string) {
  const known = SCHEMA_NAMES.find((candidate) => candidate === name) as SchemaName | undefined;
  if (!known) return null;
  // Every version this build still publishes answers, not only the current one:
  // a `$id` pinned against an older contract must keep resolving to the schema
  // it was pinned to.
  if (version !== undefined && !publishesSchema(known, version)) return null;
  return jsonResponse(JSON.stringify(jsonSchema(known, version, origin)), SCHEMA_TTL);
}
