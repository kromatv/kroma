// The wire format as JSON Schema, DERIVED from the zod schemas rather than
// hand-written beside them: a publisher in another language validates against
// the same definition this client parses with, and the two cannot drift.
//
// Served per VERSION. A pinned `$id` must keep answering with the schema it was
// pinned to, so a new contract is a new document beside the old one, never an
// edit to it.

import { z } from 'zod';
import { DOCUMENT_SCHEMAS, REGISTRY_API_VERSION } from './documents/index.ts';
import { MANIFEST_SCHEMAS, MODULE_SCHEMA_VERSION } from './manifest/index.ts';

// zod strips unknown keys, which is right for a client reading a document it
// does not fully know. The PUBLISHED contract is open-world though: a registry
// may carry fields a later apiVersion defines, and a validator must not call
// that invalid.
function openWorld(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(openWorld);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'additionalProperties' && value === false) continue;
    out[key] = openWorld(value);
  }
  return out;
}

/** The document names a conforming registry serves a schema for. */
export type SchemaName = 'manifest' | 'registry' | 'index' | 'module';

export const SCHEMA_NAMES: SchemaName[] = ['manifest', 'registry', 'index', 'module'];

/** Which version of its contract a document currently belongs to. The manifest
 *  and the served documents version independently. */
export const schemaVersionOf = (name: SchemaName): number =>
  name === 'manifest' ? MODULE_SCHEMA_VERSION : REGISTRY_API_VERSION;

/** Where a schema is published: `/schemas/<version>/<name>.json`, the shape
 *  Biome and json-schema.org already use (and that this repo already pins
 *  against in `biome.json`). Versioned, so a later contract is a NEW document
 *  rather than a silent edit to the one third parties pinned against. */
export const schemaPath = (name: SchemaName, version = schemaVersionOf(name)): string =>
  `/schemas/${version}/${name}.json`;

// Every version ever published, not just the current one.
function schemaFor(name: SchemaName, version: number): z.ZodType | undefined {
  if (name === 'manifest') return MANIFEST_SCHEMAS[version];
  return DOCUMENT_SCHEMAS[version]?.[name];
}

/** Whether this build still publishes that version of that document. */
export const publishesSchema = (name: SchemaName, version: number): boolean =>
  schemaFor(name, version) !== undefined;

/** A JSON Schema document. */
export type JsonSchema = Record<string, unknown>;

/** The JSON Schema (draft 2020-12) for one version of one document, or `null`
 *  when this build does not publish that version. `origin` makes `$id` the URL
 *  it is actually served from. */
export function jsonSchema(
  name: SchemaName,
  version = schemaVersionOf(name),
  origin = 'https://modules.kroma.tv',
): JsonSchema | null {
  const schema = schemaFor(name, version);
  if (!schema) return null;
  const emitted = openWorld(z.toJSONSchema(schema, { io: 'output' })) as JsonSchema;
  return { ...emitted, $id: `${origin}${schemaPath(name, version)}` };
}
