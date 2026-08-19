#!/usr/bin/env bun

// Build a static module registry from the packed `.kmod` files: a catalog
// index (schema 2) plus the `.kmod` files themselves, ready to publish to any
// static host. The in-app Store fetches the index, picks the artifact
// matching the server's build target, verifies its sha256, and resolves
// `dependencies` before installing.
//
//   bun run modules registry                             # from dist/modules/*.kmod
//   bun run modules registry --base https://mods.example.com
//   bun run modules registry --base .../releases/download/v0.1.5
//   bun run modules registry --from ./bundles --out ./public --base https://…
//
// Output: <out>/{registry.json, index.json, m/<id>.json, catalog.json,
//               <id>[-<target>].kmod, ...}
//
// Every field it writes is READ OUT OF THE BUNDLES: the manifest from the tar,
// the size and checksum from the bytes. Nothing is authored beside them, which
// is what lets a third party publish a registry with one command and no
// pipeline.
//
// One base URL for every module, which makes this the LOCAL/self-hosted shape:
// every bundle AND every RFC-110 document sits in one directory, so the base is
// also the registry's own root. The release pipeline uses
// `modules release` instead, because a per-module tag gives each module its own
// base - see that command.
//
// Catalog schema 2: one entry per module id with `artifacts` grouped per
// build target (a sidecar .kmod carries a native binary, so CI packs one per
// target and suffixes the filename with the triple). Flat url/size/sha256 of
// the first artifact are kept per entry so schema-1 consumers keep working.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  buildDescriptor,
  buildIndex,
  buildModuleRecord,
  jsonSchema,
  SCHEMA_NAMES,
  schemaPath,
} from '@kroma/registry';
import { readBundles, toEntries } from './bundles';
import { root } from './root';

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

// Relative to the caller's cwd, not the repo: the point of --from/--out is
// running this outside a KROMA checkout.
const resolve = (value: string | undefined, fallback: string) => {
  if (!value) return join(root, fallback);
  return isAbsolute(value) ? value : join(process.cwd(), value);
};

const modulesDir = resolve(flag('from'), 'dist/modules');
const outDir = resolve(flag('out'), 'dist/registry');
const baseUrl = (flag('base') ?? '').replace(/\/$/, '');

const bundles = readBundles(modulesDir);
mkdirSync(outDir, { recursive: true });
for (const b of bundles) {
  copyFileSync(b.path, join(outDir, b.file));
}

const modules = toEntries(bundles, () => baseUrl);

// Schema-2 catalog, kept for the transition (RFC 110 compatibility mirror).
const catalog = { schema: 2, generatedAt: new Date().toISOString(), modules };
writeFileSync(join(outDir, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

// RFC 110: the descriptor, the one-request index, and one record per module.
// Static files any host can serve, in the layout the contract names.
const write = (rel: string, value: unknown) => {
  const path = join(outDir, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
write('registry.json', buildDescriptor('KROMA modules', baseUrl, modules));
write('index.json', buildIndex(modules));
for (const entry of modules) write(`m/${entry.id}.json`, buildModuleRecord(entry));

// The schemas too, so a self-hosted registry describes itself rather than
// sending a reader to another host. Their `$id` stays the canonical one: this is
// a mirror of the contract, not a second contract claiming the same name.
for (const name of SCHEMA_NAMES) {
  const schema = jsonSchema(name);
  write(schemaPath(name).replace(/^\//, ''), schema);
  write(`schemas/${name}.json`, schema);
}

console.log(
  `registry: ${modules.length} module(s) -> ${outDir}/{catalog,registry,index}.json + m/*.json + schemas/`,
);
for (const m of modules) {
  const targets = m.artifacts.map((a) => a.target ?? 'universal').join(', ');
  console.log(`  ${m.id}  v${m.version}  [${targets}]`);
}
