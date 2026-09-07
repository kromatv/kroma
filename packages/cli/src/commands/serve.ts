import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDescriptor,
  buildIndex,
  buildModuleRecord,
  jsonSchema,
  SCHEMA_NAMES,
  type SchemaName,
} from '@kroma/registry';
import { Hono } from 'hono';
import { readBundles, toEntries } from '../bundle/read';
import { resolveDir } from './registry';

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
    const named = readBundles(dir).some((b) => b.file === file);
    const path = join(dir, file);
    if (!named || !existsSync(path)) return c.json({ error: 'no such bundle' }, 404);
    const bytes = readFileSync(path);
    return new Response(
      new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength),
      {
        headers: { 'content-type': 'application/octet-stream' },
      },
    );
  });
  return app;
}

export interface ServeOptions {
  from?: string | undefined;
  port?: number | undefined;
  cwd?: string;
}

/** `kroma serve`: the packed bundles as a live RFC 110 registry, to browse and
 *  verify. A server installs over https only, so install a local build with
 *  `kroma install` instead. */
export async function serveCommand(options: ServeOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const dir = resolveDir(options.from, 'dist/modules', cwd);
  const port = options.port ?? 4173;
  Bun.serve({ port, fetch: registryApp(dir).fetch });
  const found = readBundles(dir);
  console.log(`serving ${found.length} bundle(s) from ${dir}\n`);
  for (const b of found) console.log(`  ${b.manifest.id}  v${b.manifest.version}`);
  console.log(`\n  http://localhost:${port}/registry.json`);
  console.log(`\nAdd http://localhost:${port} under Admin -> Modules -> Registries to browse it.`);
  await new Promise<never>(() => {});
  return 0;
}
