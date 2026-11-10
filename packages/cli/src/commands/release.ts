import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareRaw, foldHistory, parse } from '@kromatv/registry';
import type { Catalog, Entry } from '../bundle/catalog';
import { type Bundle, readBundles, toEntries } from '../bundle/read';
import { versions } from '../scaffold/plan';
import { floorBeyondRelease } from '../server-floor';
import { byCodeUnit } from '../sort';
import { DEFAULT_CATALOG, defaultHistory, loadHistory, loadPublished } from './published';
import { resolveDir } from './registry';

/** The git tag a module's release is cut under. Kept in one place: the workflow,
 *  the catalog URLs and the recovery path must all agree on it. */
export function tagFor(id: string, version: string): string {
  return `${id}@${version}`;
}

const RELEASE_DOWNLOAD = /^(https:\/\/github\.com\/)[^/]+\/[^/]+(\/releases\/download\/)/;

function underRepo(entry: Entry, repo: string): Entry {
  const move = (url: string): string =>
    url.replace(RELEASE_DOWNLOAD, (_, host: string, tail: string) => `${host}${repo}${tail}`);
  return {
    ...entry,
    url: move(entry.url),
    artifacts: entry.artifacts.map((a) => ({ ...a, url: move(a.url) })),
  };
}

export type Verdict =
  | { kind: 'new' }
  | { kind: 'publish'; from: string }
  | { kind: 'unchanged' }
  | { kind: 'stale'; published: string }
  | { kind: 'backwards'; published: string };

/**
 * What should happen to one module, given what is live and what was just packed.
 * At the same version, the bundle's content hash is compared with the published
 * one; a published entry that recorded none says nothing either way.
 */
export function verdictFor(local: Entry, live: Entry | undefined): Verdict {
  if (!live) return { kind: 'new' };
  const order = compareRaw(local.version, live.version);
  if (order < 0) return { kind: 'backwards', published: live.version };
  if (order > 0) return { kind: 'publish', from: live.version };

  const published = live.artifacts[0]?.contentHash;
  if (published && published !== local.artifacts[0]?.contentHash) {
    return { kind: 'stale', published: live.version };
  }
  return { kind: 'unchanged' };
}

export interface PlannedRelease {
  id: string;
  version: string;
  tag: string;
  files: string[];
  reason: 'new' | 'publish';
}

export interface Plan {
  publish: PlannedRelease[];
  unchanged: string[];
  /** In the live catalog but not packed here: kept, so a partial run cannot
   *  delete the rest from everyone's Store. */
  carried: string[];
}

export interface Decisions {
  plan: Plan;
  catalog: Catalog;
  /** Changed bytes with no version bump: a warning by default, fatal under `--strict`. */
  stale: string[];
  /** Backwards or unorderable versions: always fatal. */
  errors: string[];
}

/** The whole decision, as data, so the table, the exit code and the tests read
 *  the same answer. */
export function decide(
  bundles: readonly Bundle[],
  published: Catalog,
  repo: string,
  now: string,
  release?: string,
): Decisions {
  const live = new Map((published.modules ?? []).map((m) => [m.id, m]));
  const local = toEntries(
    bundles,
    (b) =>
      `https://github.com/${repo}/releases/download/${tagFor(b.manifest.id, b.manifest.version)}`,
  );

  const plan: Plan = { publish: [], unchanged: [], carried: [] };
  const stale: string[] = [];
  const errors: string[] = [];
  const entries: Entry[] = [];

  for (const entry of local) {
    if (!parse(entry.version)) {
      errors.push(
        `${entry.id}: version ${JSON.stringify(entry.version)} is not semver, so it cannot be ordered against what is published`,
      );
      continue;
    }
    const beyond = release ? floorBeyondRelease(entry, release) : null;
    if (beyond) {
      errors.push(beyond);
      const kept = live.get(entry.id);
      if (kept) entries.push(underRepo(kept, repo));
      continue;
    }
    const verdict = verdictFor(entry, live.get(entry.id));
    switch (verdict.kind) {
      case 'new':
      case 'publish':
        plan.publish.push({
          id: entry.id,
          version: entry.version,
          tag: tagFor(entry.id, entry.version),
          files: entry.artifacts.flatMap((a) => [a.file, `${a.file}.sha256`]),
          reason: verdict.kind,
        });
        entries.push(entry);
        break;
      case 'unchanged':
        plan.unchanged.push(entry.id);
        entries.push(underRepo(live.get(entry.id) as Entry, repo));
        break;
      case 'stale':
        stale.push(
          [
            `${entry.id}: the bundle changed but the version did not.`,
            `    module.json says ${entry.version}, which is already published`,
            `    Bump the module's version past ${verdict.published} and re-push.`,
          ].join('\n'),
        );
        entries.push(underRepo(live.get(entry.id) as Entry, repo));
        break;
      case 'backwards':
        errors.push(
          `${entry.id}: version ${entry.version} is OLDER than the published ${verdict.published}; a release cannot go backwards`,
        );
        entries.push(underRepo(live.get(entry.id) as Entry, repo));
        break;
    }
  }

  const packed = new Set(local.map((m) => m.id));
  for (const [id, entry] of live) {
    if (!packed.has(id)) {
      plan.carried.push(id);
      entries.push(underRepo(entry, repo));
    }
  }

  entries.sort((a, b) => byCodeUnit(a.id, b.id));
  return { plan, catalog: { schema: 2, generatedAt: now, modules: entries }, stale, errors };
}

function report(plan: Plan, stale: string[], errors: string[], strict: boolean): void {
  for (const r of plan.publish) {
    const label = r.reason === 'new' ? 'new' : 'update';
    console.log(`  publish  ${r.tag}  (${label})`);
  }
  for (const id of plan.unchanged) console.log(`  unchanged ${id}`);
  for (const id of plan.carried) console.log(`  carried  ${id} (not built in this run)`);
  if (stale.length > 0) {
    console.warn(`\n${stale.length} module(s) changed without a version bump, NOT published:\n`);
    for (const s of stale) console.warn(`  ! ${s}\n`);
    console.warn(
      strict
        ? '  --strict: treating unbumped modules as a failure.'
        : '  The ready modules above still ship. Bump these and re-push to release them.',
    );
  }
  if (errors.length > 0) {
    console.error(`\n${errors.length} module(s) cannot be released:\n`);
    for (const e of errors) console.error(`  x ${e}\n`);
  }
}

export interface ReleaseOptions {
  repo?: string;
  published?: string;
  publishedHistory?: string;
  from?: string;
  out?: string;
  dryRun?: boolean;
  strict?: boolean;
  cwd?: string;
}

/** `kroma release`: decide which packed modules publish on their own tags, and
 *  merge the catalog against what is already live. Writes `modules.json`,
 *  `history.json` and `plan.json` under `--out`. */
export async function releaseCommand(options: ReleaseOptions): Promise<number> {
  const repo = options.repo ?? process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('--repo owner/name is required (or set GITHUB_REPOSITORY)');
  const cwd = options.cwd ?? process.cwd();
  const modulesDir = resolveDir(options.from, 'dist/modules', cwd);
  const outDir = resolveDir(options.out, 'dist/registry', cwd);

  const bundles = readBundles(modulesDir);
  const published = await loadPublished(options.published ?? DEFAULT_CATALOG);
  const publishedHistory = await loadHistory(options.publishedHistory ?? defaultHistory(repo));
  const now = new Date().toISOString();
  const { plan, catalog, stale, errors } = decide(
    bundles,
    published,
    repo,
    now,
    versions(cwd).server,
  );
  report(plan, stale, errors, options.strict === true);
  if (errors.length > 0) return 1;
  if (options.strict && stale.length > 0) return 1;
  if (options.dryRun) {
    console.log('\n--dry-run: wrote nothing');
    return 0;
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'modules.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  const history = foldHistory(publishedHistory, catalog.modules, now);
  writeFileSync(join(outDir, 'history.json'), `${JSON.stringify(history, null, 2)}\n`);
  writeFileSync(join(outDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    `\n${plan.publish.length} release(s) to cut; catalog describes ${catalog.modules.length} module(s) -> ${outDir}`,
  );
  return 0;
}
