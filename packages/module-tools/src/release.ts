#!/usr/bin/env bun

// Decide what to publish, on each module's OWN release train.
//
// Modules used to ride the server's release: the catalog's download base was the
// server tag, so a module fix could only reach anyone when a server version
// shipped, and every module was republished at whatever version its manifest
// happened to say. Nothing checked that the version had moved, so the same
// version went out again with different bytes and the Store - which compares
// versions to offer an update - correctly concluded there was nothing to do.
// Fixes shipped to nobody.
//
// So: each module releases under its own tag `<id>@<version>`, and the published
// catalog is the merge of the newest release of each module. This command reads
// the live catalog, compares it against what was just packed, and answers three
// questions per module:
//
//   changed + version bumped  -> publish under a new tag
//   unchanged                 -> skip; carry the live entry forward untouched
//   changed + version NOT bumped -> FAIL, naming the module and both hashes
//
//   bun run modules release --repo owner/repo
//   bun run modules release --repo owner/repo --published ./live.json
//   bun run modules release --repo owner/repo --dry-run
//
// Outputs (dist/registry/):
//   modules.json  the merged catalog to publish
//   plan.json     which tags to cut, and which files belong to each
//
// The live catalog is the pipeline's memory of what is published. It is also a
// release asset, and every per-module release keeps its own bundles, so a lost
// catalog is rebuildable from `gh release list`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareRaw, parse } from '@kroma/registry';
import { type Bundle, readBundles, toEntries } from './bundles';
import { Catalog, type Entry } from './catalog';
import { byCodeUnit } from './sort';

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
 *
 * `live` is undefined for a module that has never been published. Targets are
 * compared individually: a bundle whose target was not built in this run says
 * nothing about whether the module changed (a partial run must not read as
 * "unchanged"), so only targets present on BOTH sides are compared.
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
      // An unknown published hash predates contentHash in the catalog; treat it
      // as a match rather than demanding a bump nobody can justify.
      return published !== undefined && published !== a.contentHash;
    })
    .map((a) => a.target ?? 'universal');
  stale.sort(byCodeUnit);
  if (stale.length > 0) {
    return { kind: 'stale', published: live.version, targets: stale };
  }
  return { kind: 'unchanged' };
}

/** The live catalog, from a URL or a local file. A registry that has never been
 *  published yet is an empty catalog, not an error - that is a first release. */
async function loadPublished(source: string): Promise<Catalog> {
  if (!/^https?:\/\//.test(source)) {
    if (!existsSync(source)) {
      throw new Error(`--published ${source} does not exist`);
    }
    return Catalog.parse(JSON.parse(readFileSync(source, 'utf8')));
  }
  const res = await fetch(source, { headers: { 'user-agent': 'kroma-module-tools' } });
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
  // In the live catalog but not packed here: kept, so a run that built a subset
  // of modules cannot silently delete the rest from everyone's Store.
  carried: string[];
}

export interface Decisions {
  plan: Plan;
  catalog: Catalog;
  errors: string[];
}

/** The whole decision, as data. Pure so the table, the exit code and the tests
 *  all read the same answer. */
export function decide(
  bundles: Bundle[],
  published: Catalog,
  repo: string,
  now: string,
): Decisions {
  const live = new Map((published.modules ?? []).map((m) => [m.id, m]));
  // Provisional URLs under each module's own prospective tag; a module that
  // turns out to be unchanged has its live entry carried forward instead, so
  // these are only ever used by the modules actually being published.
  const local = toEntries(
    bundles,
    (b) =>
      `https://github.com/${repo}/releases/download/${tagFor(b.manifest.id, b.manifest.version)}`,
  );

  const plan: Plan = { publish: [], unchanged: [], carried: [] };
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
        // The LIVE entry, not the local one: its URLs already point at the tag
        // that actually holds those bytes.
        entries.push(live.get(entry.id) as Entry);
        break;
      case 'stale':
        errors.push(
          [
            `${entry.id}: the bundle changed but the version did not.`,
            `    module.json says ${entry.version}, which is already published`,
            `    differing target(s): ${verdict.targets.join(', ')}`,
            `    Bump modules/${entry.id}/module.json past ${verdict.published} and re-push.`,
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
  return { plan, catalog: { schema: 2, generatedAt: now, modules: entries }, errors };
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export async function main(): Promise<void> {
  const repo = flag('repo') ?? process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('--repo owner/name is required (or set GITHUB_REPOSITORY)');
  const dryRun = process.argv.includes('--dry-run');

  // Imported here, not at module scope: `root` resolves through `import.meta.dir`,
  // which only Bun defines, and the decision logic above is unit-tested under vitest.
  const { root } = await import('./root');
  const modulesDir = join(root, 'dist/modules');
  const outDir = join(root, 'dist/registry');

  const bundles = readBundles(modulesDir);
  const published = await loadPublished(flag('published') ?? DEFAULT_REGISTRY);
  const { plan, catalog, errors } = decide(bundles, published, repo, new Date().toISOString());

  for (const r of plan.publish) {
    const label = r.reason === 'new' ? 'new' : 'update';
    console.log(`  publish  ${r.tag}  (${label}, ${r.files.length / 2} artifact(s))`);
  }
  for (const id of plan.unchanged) console.log(`  unchanged ${id}`);
  for (const id of plan.carried) console.log(`  carried  ${id} (not built in this run)`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} module(s) cannot be released:\n`);
    for (const e of errors) console.error(`  ✗ ${e}\n`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--dry-run: wrote nothing');
    return;
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'modules.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  writeFileSync(join(outDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    `\n${plan.publish.length} release(s) to cut; catalog describes ${catalog.modules.length} module(s) -> ${outDir}`,
  );
}
