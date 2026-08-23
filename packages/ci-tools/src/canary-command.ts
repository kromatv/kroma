import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { z } from 'zod';
import { summary, warning } from './actions';
import { type Asset, canaryName, expired, RETENTION } from './canary';

const Assets = z.object({
  assets: z.array(z.object({ name: z.string().min(1), created_at: z.string() })).default([]),
});

const NOTES =
  'Rolling builds of `main`. Every file here was built by CI from a commit that passed the gates, and none of them is a release: the version in the name says which push it was. Stable releases are on the `vX.Y.Z` tags.';

async function ensureRelease(tag: string): Promise<void> {
  const exists = await $`gh release view ${tag}`.quiet().nothrow();
  if (exists.exitCode === 0) return;
  await $`gh release create ${tag} --prerelease --title "KROMA canary" --notes ${NOTES}`;
}

async function listAssets(tag: string): Promise<Asset[]> {
  const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GH_REPO is not set');
  const body = await $`gh api repos/${repo}/releases/tags/${tag}`.json();
  return Assets.parse(body).assets.map((a) => ({ name: a.name, createdAt: a.created_at }));
}

function stage(files: string[], rename: { triplet: string; canary: string } | null): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-canary-'));
  return files.map((file) => {
    const name = rename ? canaryName(file, rename.triplet, rename.canary) : file.split('/').at(-1);
    if (!name) throw new Error(`not a file: ${file}`);
    const target = join(dir, name);
    copyFileSync(file, target);
    return target;
  });
}

async function prune(tag: string, now: Date): Promise<string[]> {
  const gone = expired(await listAssets(tag), now, RETENTION);
  for (const asset of gone) {
    const result = await $`gh release delete-asset ${tag} ${asset.name} -y`.nothrow();
    if (result.exitCode !== 0) warning(`could not delete ${asset.name} from ${tag}`);
  }
  return gone.map((a) => a.name);
}

export async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      tag: { type: 'string', default: 'canary' },
      rename: { type: 'boolean', default: false },
      triplet: { type: 'string' },
      version: { type: 'string' },
    },
  });
  const [verb, ...files] = positionals;
  if (verb !== 'publish' || files.length === 0) {
    throw new Error(
      'usage: bun run ci canary publish [--rename --triplet X.Y.Z --version V] <file...>',
    );
  }
  let rename: { triplet: string; canary: string } | null = null;
  if (values.rename) {
    if (!values.triplet || !values.version)
      throw new Error('--rename needs --triplet and --version');
    rename = { triplet: values.triplet, canary: values.version };
  }

  const staged = stage(files, rename);
  await ensureRelease(values.tag);
  await $`gh release upload ${values.tag} ${staged} --clobber`;
  const pruned = await prune(values.tag, new Date());

  const uploaded = staged.map((f) => `- ${f.split('/').at(-1)}`).join('\n');
  const removed = pruned.length > 0 ? `\n\nRetired: ${pruned.join(', ')}` : '';
  summary(`### Canary (\`${values.tag}\`)\n\n${uploaded}${removed}`);
}
