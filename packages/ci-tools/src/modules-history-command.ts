import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { type DescribedModule, foldHistory, VersionHistory } from '@kromatv/registry';
import { $ } from 'bun';
import { z } from 'zod';
import { summary, warning } from './actions';
import {
  describeRelease,
  type ModuleRelease,
  manifestPath,
  missingReleases,
  Release,
} from './modules-history';

const CONCURRENCY = 8;

const Contents = z.object({ content: z.string(), encoding: z.literal('base64') });

async function publishedHistory(url: string): Promise<VersionHistory | null> {
  const res = await fetch(url, { headers: { 'user-agent': 'kroma-ci' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return VersionHistory.parse(await res.json());
}

async function releases(repo: string): Promise<Release[]> {
  const path = `repos/${repo}/releases?per_page=100`;
  const lines = await $`gh api --paginate ${path} --jq ${'.[]|@json'}`.text();
  return lines
    .split('\n')
    .filter(Boolean)
    .map((line) => Release.parse(JSON.parse(line)));
}

async function manifestAt(repo: string, release: ModuleRelease): Promise<unknown> {
  const path = `repos/${repo}/contents/${manifestPath(release.id)}?ref=${encodeURIComponent(release.tag)}`;
  const result = await $`gh api ${path}`.quiet().nothrow();
  if (result.exitCode !== 0) return null;
  const file = Contents.parse(result.json());
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
}

async function describeAll(repo: string, missing: ModuleRelease[]): Promise<DescribedModule[]> {
  const described: DescribedModule[] = [];
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const manifests = await Promise.all(batch.map((release) => manifestAt(repo, release)));
    batch.forEach((release, j) => {
      const entry = describeRelease(release, manifests[j]);
      if (entry) described.push(entry);
      else warning(`${release.tag}: no readable module.json at the tag; left undescribed`);
    });
  }
  return described;
}

/** `bun run ci modules-history`: add every module release the published version
 *  history does not describe yet, reading each one's manifest at its tag. The
 *  first run builds the history; every later run repairs it. */
export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: 'string' },
      published: { type: 'string' },
      out: { type: 'string', default: 'dist/registry/history.json' },
    },
  });
  const repo = values.repo ?? process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('--repo owner/name is required (or set GH_REPO)');
  const source =
    values.published ?? `https://github.com/${repo}/releases/download/modules/history.json`;

  const published = await publishedHistory(source);
  const missing = missingReleases(await releases(repo), published);
  const described = await describeAll(repo, missing);
  const history = foldHistory(published, described, new Date().toISOString());

  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(history, null, 2)}\n`);
  const versions = Object.values(history.modules).reduce((n, v) => n + Object.keys(v).length, 0);
  summary(
    `Version history: ${versions} version(s) of ${Object.keys(history.modules).length} module(s), ${described.length} of ${missing.length} missing release(s) added this run.`,
  );
}
