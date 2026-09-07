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
import { readBundles, toEntries } from '../bundle/read';

export interface RegistryOptions {
  from?: string | undefined;
  out?: string | undefined;
  base?: string | undefined;
  cwd?: string;
}

export function resolveDir(value: string | undefined, fallback: string, cwd: string): string {
  if (!value) return join(cwd, fallback);
  return isAbsolute(value) ? value : join(cwd, value);
}

/** `kroma registry`: the packed bundles as a static RFC 110 registry, every
 *  field read out of the bundles themselves, under one base URL. */
export function registryCommand(options: RegistryOptions): number {
  const cwd = options.cwd ?? process.cwd();
  const modulesDir = resolveDir(options.from, 'dist/modules', cwd);
  const outDir = resolveDir(options.out, 'dist/registry', cwd);
  const baseUrl = (options.base ?? '').replace(/\/$/, '');

  const bundles = readBundles(modulesDir);
  mkdirSync(outDir, { recursive: true });
  for (const b of bundles) copyFileSync(b.path, join(outDir, b.file));

  const modules = toEntries(bundles, () => baseUrl);
  const write = (rel: string, value: unknown) => {
    const path = join(outDir, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  };
  write('catalog.json', { schema: 2, generatedAt: new Date().toISOString(), modules });
  write('registry.json', buildDescriptor('KROMA modules', baseUrl, modules));
  write('index.json', buildIndex(modules));
  for (const entry of modules) write(`m/${entry.id}.json`, buildModuleRecord(entry));
  for (const name of SCHEMA_NAMES) {
    const schema = jsonSchema(name);
    write(schemaPath(name).replace(/^\//, ''), schema);
    write(`schemas/${name}.json`, schema);
  }

  console.log(`registry: ${modules.length} module(s) -> ${outDir}`);
  for (const m of modules) {
    const targets = m.artifacts.map((a) => a.target ?? 'universal').join(', ');
    console.log(`  ${m.id}  v${m.version}  [${targets}]`);
  }
  return 0;
}
