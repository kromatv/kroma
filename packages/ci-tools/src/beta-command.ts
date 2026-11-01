import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { z } from 'zod';
import { notice, setOutput, summary } from './actions';
import { type AscKey, ascToken, importP8, latestBuild } from './asc';
import { newestPromotable, parseRecorded, type Recorded, verdict } from './beta';

const RECENT_RUNS = 20;
const USAGE =
  'usage: bun run ci beta pick --app <App Store Connect app id> [--run <Build & Release run id>]';

const Run = z.object({ name: z.string(), status: z.string() });
const Runs = z.object({ workflow_runs: z.array(z.object({ id: z.number().int() })) });

function repo(): string {
  const slug = process.env.GH_REPO;
  if (!slug) throw new Error('GH_REPO is not set');
  return slug;
}

async function ascKey(): Promise<AscKey> {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY) {
    throw new Error(
      'ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY are needed to ask App Store Connect',
    );
  }
  return {
    keyId: ASC_KEY_ID,
    issuerId: ASC_ISSUER_ID,
    signingKey: await importP8(ASC_PRIVATE_KEY),
  };
}

async function recorded(runId: string): Promise<Recorded> {
  const dir = mkdtempSync(join(tmpdir(), 'candidate-'));
  await $`gh run download ${runId} -n candidate-version -D ${dir}`.quiet();
  const buildFile = join(dir, 'candidate-build.txt');
  return parseRecorded(
    readFileSync(join(dir, 'candidate-version.txt'), 'utf8'),
    existsSync(buildFile) ? readFileSync(buildFile, 'utf8') : undefined,
  );
}

async function gate(slug: string, runId: number): Promise<string | null> {
  const path = `repos/${slug}/actions/runs/${runId}/jobs?per_page=100`;
  const conclusion =
    await $`gh api ${path} --paginate --jq ${'.jobs[] | select(.name == "Candidate gate") | .conclusion'}`.text();
  return conclusion.trim() || null;
}

async function recentCandidates(slug: string): Promise<number[]> {
  const path = `repos/${slug}/actions/workflows/release.yml/runs?branch=main&event=push&status=completed&per_page=${RECENT_RUNS}`;
  return Runs.parse(await $`gh api ${path}`.json()).workflow_runs.map((run) => run.id);
}

function ship(runId: string, version: string, why: string): void {
  setOutput('run', runId);
  setOutput('version', version);
  notice(`Shipping ${version} from run ${runId}: ${why}.`);
  summary(`### Beta channels\n\nShipping **${version}** from run ${runId}: ${why}.`);
}

function skip(reason: string): void {
  notice(`Nothing to ship: ${reason}.`);
  summary(`### Beta channels\n\nNothing to ship: ${reason}.`);
}

async function decide(runId: string, { version, build }: Recorded, appId: string): Promise<void> {
  const uploaded = await latestBuild(appId, await ascToken(await ascKey()));
  const decision = verdict(build, uploaded);
  if (decision.ship)
    ship(runId, version, `build ${build} is past the stores' ${uploaded ?? 'none'}`);
  else skip(decision.reason);
}

async function pickRun(runId: string, appId: string): Promise<void> {
  const path = `repos/${repo()}/actions/runs/${runId}`;
  const run = Run.parse(await $`gh api ${path}`.json());
  if (run.name !== 'Build & Release')
    throw new Error(`run ${runId} is '${run.name}', not Build & Release`);
  if (run.status !== 'completed') throw new Error(`run ${runId} is still ${run.status}`);
  const record = await recorded(runId);
  if (record.build === undefined) ship(runId, record.version, 'it predates recorded build numbers');
  else await decide(runId, record, appId);
}

async function pickNewest(appId: string): Promise<void> {
  const slug = repo();
  const candidate = await newestPromotable(await recentCandidates(slug), (id) => gate(slug, id));
  if (candidate === undefined) {
    skip(`none of the last ${RECENT_RUNS} pushes to main passed its Candidate gate`);
    return;
  }
  await decide(String(candidate), await recorded(String(candidate)), appId);
}

export async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { app: { type: 'string' }, run: { type: 'string', default: '' } },
  });
  if (positionals[0] !== 'pick' || !values.app) throw new Error(USAGE);
  if (values.run) {
    if (!/^\d+$/.test(values.run)) throw new Error(`'${values.run}' is not a run id`);
    await pickRun(values.run, values.app);
    return;
  }
  await pickNewest(values.app);
}
