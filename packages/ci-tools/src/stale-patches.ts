import { z } from 'zod';

const RootManifest = z.object({
  patchedDependencies: z.record(z.string(), z.string()).default({}),
});

/**
 * The `patchedDependencies` keys of a root `package.json` whose `name@version`
 * `bun.lock` no longer resolves. Bun skips such a patch without a word, so the
 * change that moved the package has to drop or rebase it.
 */
export function stalePatches(manifest: unknown, lock: string): string[] {
  const { patchedDependencies } = RootManifest.parse(manifest);
  return Object.keys(patchedDependencies).filter((key) => !lock.includes(`": ["${key}"`));
}
