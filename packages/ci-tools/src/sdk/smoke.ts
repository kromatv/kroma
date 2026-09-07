import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { z } from 'zod';
import { SDK } from './manifest';

const ID = 'tv.kroma.smoke';

/** What a module author relies on the declarations for: a kit icon name is a
 *  checked literal, a client id is branded, the SDK's hooks are typed. */
const TYPES_PROBE = `import type { RequestId } from '@kroma/client/requests';
import type { IconName } from '@kroma/ui/kit';
import type { useFetch } from '@kromatv/sdk';

export const icon: IconName = 'download';
// @ts-expect-error a name the icon set does not have
export const missing: IconName = 'no-such-icon';
// @ts-expect-error a bare string is not a RequestId
export const id: RequestId = 'r1';
export type Fetch = typeof useFetch;
`;

const PackageJson = z
  .object({
    dependencies: z.record(z.string(), z.string()).default({}),
    devDependencies: z.record(z.string(), z.string()).default({}),
  })
  .loose();

/** The staged SDK tarball in `out`. */
export function tarballIn(out: string): string {
  const stem = SDK.replace('@', '').replace('/', '-');
  const file = readdirSync(out).find((f) => f.startsWith(`${stem}-`) && f.endsWith('.tgz'));
  if (!file) throw new Error(`sdk smoke: no ${SDK} tarball in ${out}; run \`sdk stage\` first`);
  return join(out, file);
}

/** Points the scaffold's SDK dependency at the staged tarball, so nothing is
 *  fetched from the registry it will come from once published. */
export function wireToTarball(manifest: string, tarball: string): string {
  const pkg = PackageJson.parse(JSON.parse(manifest));
  for (const table of [pkg.dependencies, pkg.devDependencies]) {
    if (SDK in table) table[SDK] = `file:${tarball}`;
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export interface SmokeOptions {
  out: string;
  /** Build the sidecar too (needs a Rust toolchain); off keeps it to types. */
  rust: boolean;
}

/**
 * The staged SDK, used the way an author will: install it in a fresh
 * directory, scaffold a module with its `kroma` bin, install the module from
 * the tarball alone, type-check it, and (with `rust`) build the bundle.
 */
export async function smoke(options: SmokeOptions): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-sdk-smoke-'));
  const tarball = tarballIn(options.out);
  try {
    const runner = join(dir, 'runner');
    mkdirSync(runner);
    writeFileSync(
      join(runner, 'package.json'),
      JSON.stringify({ name: 'runner', devDependencies: { [SDK]: `file:${tarball}` } }),
    );
    await $`bun install`.cwd(runner);
    const project = join(dir, ID);
    await $`bun x kroma create ${project} --id ${ID} --yes --no-install --description "SDK smoke test"`.cwd(
      runner,
    );
    const manifest = join(project, 'package.json');
    writeFileSync(manifest, wireToTarball(readFileSync(manifest, 'utf8'), tarball));
    await $`bun install`.cwd(project);
    writeFileSync(join(project, 'ui', 'src', 'types-probe.ts'), TYPES_PROBE);
    const check = options.rust ? [] : ['--no-rust'];
    await $`bun x kroma check ${check}`.cwd(project);
    if (options.rust) {
      await $`bun x kroma build`.cwd(project);
      const bundle = join(project, 'dist', 'modules', `${ID}.kmod`);
      if (!existsSync(bundle))
        throw new Error(`sdk smoke: kroma build left no bundle at ${bundle}`);
    }
    console.log(`sdk smoke: ${ID} scaffolded, installed and checked from ${tarball}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
