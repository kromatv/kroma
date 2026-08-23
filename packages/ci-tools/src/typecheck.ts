import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { z } from 'zod';
import { root } from './root';

const Root = z.object({ workspaces: z.array(z.string()) });
const Manifest = z.object({
  name: z.string().min(1),
  scripts: z.record(z.string(), z.string()).default({}),
});

interface Workspace {
  name: string;
  dir: string;
}

function workspaces(script: string): Workspace[] {
  const { workspaces: globs } = Root.parse(
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
  );
  const out: Workspace[] = [];
  for (const glob of globs) {
    for (const dir of new Bun.Glob(glob).scanSync({ cwd: root, onlyFiles: false })) {
      const manifest = join(root, dir, 'package.json');
      if (!existsSync(manifest)) continue;
      const { name, scripts } = Manifest.parse(JSON.parse(readFileSync(manifest, 'utf8')));
      if (script in scripts) out.push({ name, dir: join(root, dir) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

interface Outcome {
  name: string;
  ok: boolean;
  seconds: number;
  output: string;
}

async function run(ws: Workspace, script: string): Promise<Outcome> {
  const started = performance.now();
  const result = await $`bun run ${script}`.cwd(ws.dir).quiet().nothrow();
  return {
    name: ws.name,
    ok: result.exitCode === 0,
    seconds: (performance.now() - started) / 1000,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

/**
 * Runs one script in every workspace that has it, at most `jobs` at a time.
 * `bun run --filter '*'` starts every workspace at once, and thirty-six native
 * `tsc` processes on a four-core runner is what took the runner down.
 */
async function pool(list: Workspace[], script: string, jobs: number): Promise<Outcome[]> {
  const queue = [...list];
  const outcomes: Outcome[] = [];
  const worker = async () => {
    for (let ws = queue.shift(); ws; ws = queue.shift()) {
      const outcome = await run(ws, script);
      outcomes.push(outcome);
      const mark = outcome.ok ? 'ok  ' : 'FAIL';
      console.log(`${mark} ${outcome.name} (${outcome.seconds.toFixed(1)}s)`);
      if (!outcome.ok) console.log(outcome.output);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
  return outcomes;
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      jobs: { type: 'string', default: String(availableParallelism()) },
      script: { type: 'string', default: 'typecheck' },
    },
  });
  const jobs = Number(values.jobs);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs must be a positive integer`);

  const list = workspaces(values.script);
  console.log(`${values.script}: ${list.length} workspace(s), ${jobs} at a time`);
  const outcomes = await pool(list, values.script, jobs);
  const failed = outcomes.filter((o) => !o.ok).map((o) => o.name);
  if (failed.length > 0) throw new Error(`${values.script} failed in: ${failed.join(', ')}`);
}
