import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { summary } from './actions';
import { feed, signedBundles } from './desktop-feed';

const USAGE =
  'usage: bun run ci desktop-feed publish --tag T --version V --sha SHA [--dry-run] <dir>';

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function repository(): string {
  const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GH_REPO is not set');
  return repo;
}

async function swap(tag: string, sha: string, version: string, uploads: string[]): Promise<void> {
  const staging = `${tag}-staging`;
  const notes = `Self-update feed for KROMA ${version}: the bytes of the promoted candidate.`;
  await $`gh release delete ${staging} --cleanup-tag --yes`.quiet().nothrow();
  await $`gh release create ${staging} --draft --prerelease --target ${sha} --title ${'KROMA desktop (auto-update)'} --notes ${notes}`;
  await $`gh release upload ${staging} ${uploads}`;
  await $`gh release delete ${tag} --cleanup-tag --yes`.quiet().nothrow();
  await $`gh release edit ${staging} --tag ${tag} --draft=false --prerelease --latest=false`;
}

export async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      tag: { type: 'string' },
      version: { type: 'string' },
      sha: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const [verb, dir] = positionals;
  const { tag, version, sha } = values;
  if (verb !== 'publish' || !dir || !tag || !version || !sha) throw new Error(USAGE);

  const pairs = signedBundles(filesUnder(dir));
  const bundles = pairs.map(({ bundle, sig }) => ({
    name: bundle,
    signature: readFileSync(sig, 'utf8'),
  }));
  const baseUrl = `https://github.com/${repository()}/releases/download/${tag}`;
  const latest = feed(bundles, version, baseUrl, new Date(), `KROMA ${version}`);
  const json = `${JSON.stringify(latest, null, 2)}\n`;

  if (values['dry-run']) {
    console.log(json);
    return;
  }

  const out = join(mkdtempSync(join(tmpdir(), 'kroma-feed-')), 'latest.json');
  writeFileSync(out, json);
  const uploads = [...pairs.flatMap(({ bundle, sig }) => [bundle, sig]), out];
  await swap(tag, sha, version, uploads);

  const keys = Object.keys(latest.platforms).sort((a, b) => a.localeCompare(b));
  summary(`**${tag}** serves ${version}: ${keys.join(', ')}`);
}
