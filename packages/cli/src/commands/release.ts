import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareRaw, parse } from '@kromatv/registry';
import { Catalog, type Entry } from '../bundle/catalog';
import { type Bundle, readBundles, toEntries } from '../bundle/read';
import { byCodeUnit } from '../sort';
import { resolveDir } from './registry';

const DEFAULT_REGISTRY = 'https://modules.kroma.tv/modules.json';

/** The git tag a module's release is cut under. Kept in one place: the workflow,
 *  the catalog URLs and the recovery path must all agree on it. */
export function tagFor(id: string, version: string): string {
  return `${id}@${version}`;
}

export type Verdict =
  | { kind: 'new' }
  | { kind: 'publish'; from: string }
  | { kind: 'unchanged' }
  | { kind: 'stale'; published: string; targets: string[] }
  | { kind: 'backwards'; published: string };

/**
 * What should happen to one module, given what is live and what was just packed.
 * Targets are compared one by one, and only those present on BOTH sides: a
 * target this run did not build says nothing about whether the module changed.
 */
export function verdictFor(local: Entry, live: Entry | undefined): Verdict {
  if (!live) return { kind: 'new' };
  const order = compareRaw(local.version, live.version);
  if (order < 0) return { kind: 'backwards', published: live.version };
  if (order > 0) return { kind: 'publish', from: live.version };

  const liveHashes = new Map(live.artifacts.map((a) => [a.target ?? '', a.contentHash]));
  const stale = local.artifacts
    .filter((a) => {
      const published = liveHashes.get(a.target ?? '');
      return published !== undefined && published !== a.contentHash;
    })
    .map((a) => a.target ?? 'universal');
  stale.sort(byCodeUnit);
  if (stale.length > 0) {
    return { kind: 'stale', published: live.version, targets: stale };
  }
  return { kind: 'unchanged' };
}

async function loadPublished(source: string): Promise<Catalog> {
  if (!/^https?:\/\//.test(source)) {
    if (!existsSync(source)) throw new Error(`--published ${source} does not exist`);
    return Catalog.parse(JSON.parse(readFileSync(source, 'utf8')));
  }
  const res = await fetch(source, { headers: { 'user-agent': 'kroma-cli' } });
  if (res.status === 404) {
    console.warn(`  ! ${source} is 404: treating every module as a first release`);
    return { schema: 2, modules: [] };
  }
  if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
  return Catalog.parse(await res.json());
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
        entries.push(live.get(entry.id) as Entry);
        break;
      case 'stale':
        stale.push(
          [
            `${entry.id}: the bundle changed but the version did not.`,
            `    module.json says ${entry.version}, which is already published`,
            `    differing target(s): ${verdict.targets.join(', ')}`,
            `    Bump the module's version past ${verdict.published} and re-push.`,
          ].join('\n'),
        );
        entries.push(live.get(entry.id) as Entry);
        break;
      case 'backwards':
        errors.push(
          `${entry.id}: version ${entry.version} is OLDER than the published ${verdict.published}; a release cannot go backwards`,
        );
        entries.push(live.get(entry.id) as Entry);
        break;
    }
  }

  const packed = new Set(local.map((m) => m.id));
  for (const [id, entry] of live) {
    if (!packed.has(id)) {
      plan.carried.push(id);
      entries.push(entry);
    }
  }

  entries.sort((a, b) => byCodeUnit(a.id, b.id));
  return { plan, catalog: { schema: 2, generatedAt: now, modules: entries }, stale, errors };
}

function report(plan: Plan, stale: string[], errors: string[], strict: boolean): void {
  for (const r of plan.publish) {
    const label = r.reason === 'new' ? 'new' : 'update';
    console.log(`  publish  ${r.tag}  (${label}, ${r.files.length / 2} artifact(s))`);
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
  from?: string;
  out?: string;
  dryRun?: boolean;
  strict?: boolean;
  cwd?: string;
}

/** `kroma release`: decide which packed modules publish on their own tags, and
 *  merge the catalog against what is already live. Writes `modules.json` and
 *  `plan.json` under `--out`. */
export async function releaseCommand(options: ReleaseOptions): Promise<number> {
  const repo = options.repo ?? process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('--repo owner/name is required (or set GITHUB_REPOSITORY)');
  const cwd = options.cwd ?? process.cwd();
  const modulesDir = resolveDir(options.from, 'dist/modules', cwd);
  const outDir = resolveDir(options.out, 'dist/registry', cwd);

  const bundles = readBundles(modulesDir);
  const published = await loadPublished(options.published ?? DEFAULT_REGISTRY);
  const { plan, catalog, stale, errors } = decide(
    bundles,
    published,
    repo,
    new Date().toISOString(),
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
  writeFileSync(join(outDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    `\n${plan.publish.length} release(s) to cut; catalog describes ${catalog.modules.length} module(s) -> ${outDir}`,
  );
  return 0;
}
