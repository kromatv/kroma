#!/usr/bin/env bun

// `modules serve`: the packed `.kmod` files in a directory, served as a live
// RFC 110 registry. The local half of `modules registry`, which writes the same
// documents to disk for a static host.
//
//   bun run modules serve                      # from dist/modules, on :4173
//   bun run modules serve --from ./bundles --port 8080
//
// Reads the directory on every request, so a repack is picked up without a
// restart. Artifact URLs come from the origin the request arrived at, so there
// is no `--base` to keep in step with wherever it ends up being reached.
//
// A KROMA server refuses to INSTALL over http, so this serves a registry to
// browse and verify, not to install from. Install a local build by uploading the
// `.kmod` under Admin -> Modules.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  buildDescriptor,
  buildIndex,
  buildModuleRecord,
  jsonSchema,
  SCHEMA_NAMES,
  type SchemaName,
} from '@kroma/registry';
import { Hono } from 'hono';
import { readBundles, toEntries } from './bundles';

const REGISTRY_NAME = 'KROMA modules (local)';

const origin = (url: string) => new URL(url).origin;

const json = (value: unknown) =>
  new Response(`${JSON.stringify(value, null, 2)}\n`, {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });

const schemaNamed = (name: string): SchemaName | undefined =>
  SCHEMA_NAMES.find((candidate) => candidate === name.replace(/\.json$/, ''));

/** The registry app over `dir`, re-read per request so a repack lands live. */
export function registryApp(dir: string) {
  const app = new Hono();
  // Artifact urls point back at whoever asked, so the same tree is correct on
  // localhost, on a LAN address, and behind a tunnel.
  const entries = (url: string) => toEntries(readBundles(dir), () => origin(url));

  app.get('/registry.json', (c) =>
    json(buildDescriptor(REGISTRY_NAME, origin(c.req.url), entries(c.req.url))),
  );

  app.get('/index.json', (c) => json(buildIndex(entries(c.req.url))));

  app.get('/m/:id{[^/]+[.]json}', (c) => {
    const id = decodeURIComponent(c.req.param('id').replace(/\.json$/, ''));
    const found = entries(c.req.url).find((m) => m.id === id);
    return found ? json(buildModuleRecord(found)) : c.json({ error: 'no such module' }, 404);
  });

  app.get('/schemas/:version{[0-9]+}/:name{[^/]+[.]json}', (c) => {
    const name = schemaNamed(c.req.param('name'));
    if (!name) return c.json({ error: 'no such schema' }, 404);
    return json(jsonSchema(name, Number(c.req.param('version'))));
  });

  app.get('/schemas/:name{[^/]+[.]json}', (c) => {
    const name = schemaNamed(c.req.param('name'));
    return name ? json(jsonSchema(name)) : c.json({ error: 'no such schema' }, 404);
  });

  app.get('/:file{[^/]+[.]kmod}', (c) => {
    const file = c.req.param('file');
    // Only a file the bundle listing named, so a path cannot walk out of `dir`.
    const named = readBundles(dir).some((b) => b.file === file);
    const path = join(dir, file);
    if (!named || !existsSync(path)) return c.json({ error: 'no such bundle' }, 404);
    const bytes = readFileSync(path);
    return new Response(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      headers: { 'content-type': 'application/octet-stream' },
    });
  });

  return app;
}

function directory(from: string | undefined, root: string): string {
  if (!from) return join(root, 'dist/modules');
  return isAbsolute(from) ? from : join(process.cwd(), from);
}

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

export async function main(): Promise<void> {
  const { root } = await import('./root');
  const dir = directory(flag('from'), root);
  const port = Number(flag('port') ?? 4173);

  Bun.serve({ port, fetch: registryApp(dir).fetch });

  const found = readBundles(dir);
  console.log(`serving ${found.length} bundle(s) from ${dir}\n`);
  for (const b of found) console.log(`  ${b.manifest.id}  v${b.manifest.version}`);
  console.log(`\n  http://localhost:${port}/registry.json`);
  console.log(`\nAdd http://localhost:${port} under Admin -> Modules -> Registries.`);
  console.log('Installing needs https, so upload the .kmod there to install a local build.');
}
