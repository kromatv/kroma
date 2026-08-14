#!/usr/bin/env bun

// Build a static module registry from the packed `.kmod` files: a catalog
// index (schema 2) plus the `.kmod` files themselves, ready to publish to any
// static host. The in-app Store fetches the index, picks the artifact
// matching the server's build target, verifies its sha256, and resolves
// `dependsOn` before installing.
//
//   bun run modules registry                             # from dist/modules/*.kmod
//   bun run modules registry --base https://mods.example.com
//   bun run modules registry --base .../releases/download/v0.1.5
//
// Output: dist/registry/{catalog.json, <id>[-<target>].kmod, ...}
//
// One base URL for every module, which makes this the LOCAL/self-hosted shape:
// every bundle sits in one directory. The release pipeline uses
// `modules release` instead, because a per-module tag gives each module its own
// base - see that command.
//
// Catalog schema 2: one entry per module id with `artifacts` grouped per
// build target (a sidecar .kmod carries a native binary, so CI packs one per
// target and suffixes the filename with the triple). Flat url/size/sha256 of
// the first artifact are kept per entry so schema-1 consumers keep working.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readBundles, toEntries } from './bundles';
import { root } from './root';

const modulesDir = join(root, 'dist/modules');
const outDir = join(root, 'dist/registry');

const baseIdx = process.argv.indexOf('--base');
const baseUrl = (baseIdx >= 0 ? (process.argv[baseIdx + 1] ?? '') : '').replace(/\/$/, '');

const bundles = readBundles(modulesDir);
mkdirSync(outDir, { recursive: true });
for (const b of bundles) {
  copyFileSync(b.path, join(outDir, b.file));
}

const modules = toEntries(bundles, () => baseUrl);
const catalog = { schema: 2, generatedAt: new Date().toISOString(), modules };
writeFileSync(join(outDir, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`registry: ${modules.length} module(s) -> ${outDir}/catalog.json`);
for (const m of modules) {
  const targets = m.artifacts.map((a) => a.target ?? 'universal').join(', ');
  console.log(`  ${m.id}  v${m.version}  [${targets}]`);
}
