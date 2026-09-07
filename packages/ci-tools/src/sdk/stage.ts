import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { root } from '../root';
import { BUILT_IN, PackageJson, sdkManifest, tsconfigPreset } from './manifest';
import { vendorRust } from './vendor-rust';

function readManifest(dir: string): PackageJson {
  return PackageJson.parse(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')));
}

/** One package's declarations, emitted from a tsconfig beside its own (type
 *  roots resolve from there) that keeps `src` minus tests, stories and demos.
 *  The root stays the package, so a source that reaches a sibling tree
 *  (`vite/`) still emits. */
async function emitDeclarations(from: string, outDir: string): Promise<void> {
  const config = join(from, 'tsconfig.stage.json');
  writeFileSync(
    config,
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        incremental: false,
        rootDir: '.',
        outDir,
      },
      include: ['src'],
      exclude: [
        'src/**/*.test.*',
        'src/**/*.story.*',
        'src/**/*.demo.*',
        'src/**/*.fixtures.*',
        'src/**/*.fixture.*',
        'src/**/*.docs.mdx',
        'src/workbench-config.tsx',
        'src/testing.tsx',
      ],
    }),
  );
  const result = await $`bun x tsc --project ${config}`.cwd(from).nothrow();
  rmSync(config);
  if (result.exitCode !== 0) {
    throw new Error(
      `${from}: declaration emit failed:\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
}

/** The one thing the CLI cannot carry: Vite's bundler is a native binary. */
const CLI_EXTERNAL = ['vite'];

/** The `kroma` CLI as one file, every dependency but Vite bundled in. */
async function bundleCli(from: string, to: string): Promise<void> {
  const externals = CLI_EXTERNAL.flatMap((name) => ['--external', name]);
  const built = await $`bun build src/cli.ts --target bun --outdir ${join(to, 'dist')} ${externals}`
    .cwd(from)
    .nothrow()
    .quiet();
  if (built.exitCode !== 0) {
    throw new Error(`${from}: bundling the CLI failed:\n${built.stderr.toString()}`);
  }
  cpSync(join(from, 'templates'), join(to, 'templates'), { recursive: true });
}

/** Every icon the Tabler set exports, read off its typings: the kit's
 *  `IconName` union is derived from them, and the package is not one a module
 *  installs. */
function tablerIconNames(uiDir: string): string[] {
  const manifest = Bun.resolveSync('@tabler/icons-react-native/package.json', uiDir);
  const typings = readFileSync(
    join(manifest, '..', 'dist', 'tabler-icons-react-native.d.ts'),
    'utf8',
  );
  const names = [...typings.matchAll(/ as (Icon[A-Za-z0-9]+)\b/g)].map((m) => m[1] ?? '');
  if (names.length < 1000)
    throw new Error(`Tabler typings list ${names.length} icons; expected thousands`);
  return [...new Set(names)].sort();
}

/**
 * The kit derives `IconName` from `keyof typeof Tabler`. A module never
 * installs the icon set (the host draws the icons), so the emitted
 * declarations get the names spelled out instead, and the two files that
 * reached the package stop reaching it.
 */
function inlineIconNames(uiDir: string, typesDir: string): void {
  const glyphs = join(typesDir, 'src', 'lib', 'icons', 'glyphs.d.ts');
  const source = join(typesDir, 'src', 'lib', 'icons', 'glyph-source.d.ts');
  const importLine = "import type * as Tabler from '@tabler/icons-react-native';\n";
  const derived = 'type IconExport = Extract<keyof typeof Tabler, `Icon${string}`>;';
  const text = readFileSync(glyphs, 'utf8');
  if (!text.includes(importLine) || !text.includes(derived)) {
    throw new Error(`${glyphs}: the icon-name derivation moved; update inlineIconNames`);
  }
  const union = tablerIconNames(uiDir)
    .map((n) => `'${n}'`)
    .join(' | ');
  writeFileSync(
    glyphs,
    text.replace(importLine, '').replace(derived, `type IconExport = ${union};`),
  );
  writeFileSync(
    source,
    [
      "import type { ComponentType } from 'react';",
      'export declare const FALLBACK: ComponentType<Record<string, unknown>>;',
      'export declare const EXPORTS: Readonly<Record<string, unknown>>;',
      '',
    ].join('\n'),
  );
}

export interface StageOptions {
  version: string;
  out: string;
}

/**
 * Assembles the one public package under `out/stage` and packs it into `out/`:
 * the declarations of every built-in package under `types/<dir>/`, the
 * tsconfig preset that maps their names onto them, the Rust crates under
 * `rust/`, the CLI under `dist/`, its templates, and one manifest for all of
 * it. The one tarball a module needs.
 */
export async function stage(options: StageOptions): Promise<string> {
  const { version, out } = options;
  rmSync(out, { recursive: true, force: true });
  const to = join(out, 'stage', 'sdk');
  mkdirSync(to, { recursive: true });

  const manifests: [string, PackageJson][] = [];
  for (const [dir] of BUILT_IN) {
    const from = join(root, 'packages', dir);
    await emitDeclarations(from, join(to, 'types', dir));
    if (dir === 'ui') inlineIconNames(from, join(to, 'types', dir));
    manifests.push([dir, readManifest(from)]);
  }
  const cliDir = join(root, 'packages', 'cli');
  await bundleCli(cliDir, to);
  vendorRust({ serverDir: join(root, 'server'), outDir: join(to, 'rust'), version });

  const sdk = readManifest(join(root, 'packages', 'module-sdk'));
  writeFileSync(
    join(to, 'package.json'),
    sdkManifest(sdk, manifests, readManifest(cliDir), version),
  );
  writeFileSync(
    join(to, 'tsconfig.module.json'),
    tsconfigPreset(readFileSync(join(cliDir, 'tsconfig.module.json'), 'utf8'), manifests),
  );
  for (const [dir, rel] of [
    ['cli', 'README.md'],
    ['i18n', 'schema/catalog.schema.json'],
  ] as const) {
    const source = join(root, 'packages', dir, rel);
    if (!existsSync(source)) continue;
    mkdirSync(join(to, rel, '..'), { recursive: true });
    copyFileSync(source, join(to, rel));
  }

  const packed = await $`bun pm pack --destination ${out} --quiet`.cwd(to).text();
  const file = packed.trim().split('\n').pop() ?? '';
  const path = join(out, file.split('/').pop() ?? file);
  if (!existsSync(path)) throw new Error(`bun pm pack produced no tarball at ${path}`);
  rmSync(join(out, 'stage'), { recursive: true, force: true });
  return path;
}
