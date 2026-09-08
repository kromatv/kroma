import { z } from 'zod';
import { REACT_NATIVE_PATHS } from './react-native-types';

/** The one package that ships; its bin is `kroma`. */
export const SDK = '@kromatv/sdk';

/** What is built into it, in dependency order: each package's declarations
 *  land under `types/<dir>/`, and its own name resolves there through the
 *  tsconfig preset. Nothing in this list is published on its own. */
export const BUILT_IN = [
  ['registry', '@kromatv/registry'],
  ['i18n', '@kromatv/i18n'],
  ['spatial-nav', '@kromatv/spatial-nav'],
  ['client', '@kromatv/client'],
  ['core', '@kromatv/core'],
  ['ui', '@kromatv/ui'],
  ['module-sdk', '@kromatv/module-sdk'],
] as const;

const Deps = z.record(z.string(), z.string());

export const PackageJson = z
  .object({
    name: z.string(),
    version: z.string(),
    private: z.boolean().optional(),
    description: z.string().optional(),
    exports: z.record(z.string(), z.string()).optional(),
    dependencies: Deps.optional(),
    devDependencies: Deps.optional(),
    peerDependencies: Deps.optional(),
    peerDependenciesMeta: z.record(z.string(), z.unknown()).optional(),
    kroma: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();
export type PackageJson = z.infer<typeof PackageJson>;

const SOURCE = /^\.\/(src\/.*)\.tsx?$/;

/** A source export target as its declaration inside the SDK package:
 *  `./src/kit.ts` of `ui` → `./types/ui/src/kit.d.ts`. */
export function declarationOf(dir: string, target: string): string | null {
  const m = SOURCE.exec(target);
  return m ? `./types/${dir}/${m[1]}.d.ts` : null;
}

/** The `paths` a module's tsconfig needs so every `@kromatv/*` specifier the kit
 *  and the SDK use resolves to a declaration inside this one package, and
 *  `react-native` to the declarations shipped beside them. Built from each
 *  package's own `exports`, so a subpath cannot drift. */
export function pathsFor(
  manifests: ReadonlyArray<[string, PackageJson]>,
): Record<string, string[]> {
  const paths: Record<string, string[]> = {
    ...Object.fromEntries(Object.entries(REACT_NATIVE_PATHS).map(([k, v]) => [k, [...v]])),
  };
  for (const [dir, pkg] of manifests) {
    for (const [key, target] of Object.entries(pkg.exports ?? {})) {
      const types = declarationOf(dir, target);
      if (!types) continue;
      paths[key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`] = [types];
    }
  }
  return paths;
}

/** The compiler options a module extends, with the SDK's declarations mapped
 *  in. `paths` resolve relative to the file that declares them, which is the
 *  package root the `types/` tree sits under. */
export function tsconfigPreset(
  base: string,
  manifests: ReadonlyArray<[string, PackageJson]>,
): string {
  const preset = JSON.parse(base) as { compilerOptions: Record<string, unknown> };
  preset.compilerOptions.paths = pathsFor(manifests);
  return `${JSON.stringify(preset, null, 2)}\n`;
}

/** What the package installs: Vite, which the CLI drives and cannot bundle
 *  (its bundler is a native binary). Everything else the CLI runs on is
 *  bundled into `dist/cli.js`. The declarations name types from a few more
 *  packages (zod, TanStack's query and table); a module that has not
 *  installed one reads those as `any` under `skipLibCheck`, and the scaffold
 *  installs zod itself because every wire schema is one. */
const RUNTIME = ['vite'];
const TYPED: string[] = [];

function ranges(
  names: readonly string[],
  from: ReadonlyArray<PackageJson>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const range = from
      .map((pkg) => pkg.dependencies?.[name] ?? pkg.peerDependencies?.[name])
      .find((r) => r !== undefined);
    if (!range) throw new Error(`${name}: no workspace package declares a range for it`);
    out[name] = range;
  }
  return out;
}

/**
 * The published manifest of the one package: the SDK's own identity, the
 * CLI's runtime dependencies, React as the one peer (React Native's types
 * ship inside, its runtime is the host's), the `kroma` bin, and the kit's
 * `#ui/*` alias pointed at its declarations. Public, and the only thing that
 * is.
 */
export function sdkManifest(
  sdk: PackageJson,
  builtIn: ReadonlyArray<[string, PackageJson]>,
  cli: PackageJson,
  version: string,
): string {
  const all = [cli, sdk, ...builtIn.map(([, pkg]) => pkg)];
  const dependencies = ranges([...RUNTIME, ...TYPED], all);
  const peerDependencies = ranges(['react'], all);
  const own = declarationOf('module-sdk', sdk.exports?.['.'] ?? './src/index.ts');
  const shared = declarationOf('module-sdk', sdk.exports?.['./shared'] ?? './src/shared.ts');
  const manifest = {
    name: SDK,
    version,
    description:
      'Build KROMA modules: the SDK, the design system types, the Rust crates and the kroma CLI in one package.',
    author: sdk.author,
    license: sdk.license,
    homepage: sdk.homepage,
    repository: sdk.repository,
    keywords: ['kroma', 'module', 'kmod', 'sdk', 'cli', 'media-server'],
    type: 'module',
    bin: { kroma: './dist/cli.js' },
    exports: {
      '.': { types: own },
      './shared': { types: shared },
      './tsconfig': './tsconfig.module.json',
    },
    imports: { '#ui/*': { types: ['./types/ui/src/*.d.ts', './types/ui/src/*/index.d.ts'] } },
    files: ['dist', 'types', 'rust', 'templates', 'tsconfig.module.json', 'README.md'],
    engines: { bun: '>=1.4.0' },
    publishConfig: { access: 'public' },
    dependencies: sorted(dependencies),
    peerDependencies: sorted(peerDependencies),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function sorted(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}
