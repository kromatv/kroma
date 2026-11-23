import { parseArgs } from 'node:util';
import { setOutput, summary } from './actions';
import { changedFiles } from './changed-files';
import { readEvent, readRepo } from './event';
import { forPush, LANE_NAMES, type LaneName, matchLanes } from './lanes';
import { affected, type Reach, reach } from './rust-affected';
import { dependencyGraph } from './rust-graph';

type Verdict = ReturnType<typeof matchLanes>;

const LANES: ReadonlySet<string> = new Set(LANE_NAMES);

const isLane = (value: string): value is LaneName => LANES.has(value);

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      base: { type: 'string', default: 'origin/main' },
      lane: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });

  const event = readEvent();
  const files = await changedFiles(event, readRepo, values.base);
  const matched = matchLanes(files);
  const verdict = event.kind === 'push' ? forPush(matched) : matched;

  if (values.lane !== undefined) {
    answerLane(verdict, values.lane);
    return;
  }

  const graph = dependencyGraph();
  const jobs = reach(verdict.rust ? affected(files, graph) : [], graph);

  if (values.json) {
    const { shards: rust, components, audit } = jobs;
    console.log(JSON.stringify({ files, lanes: verdict, rust, components, audit }, null, 2));
    return;
  }

  publishLanes(verdict, files);
  publishRust(jobs);
}

function answerLane(verdict: Verdict, lane: string): void {
  if (!isLane(lane)) {
    throw new Error(`unknown lane '${lane}'`);
  }
  console.log(String(verdict[lane]));
  process.exitCode = verdict[lane] ? 0 : 1;
}

function publishLanes(verdict: Verdict, files: readonly string[] | 'all'): void {
  for (const name of LANE_NAMES) {
    setOutput(name, verdict[name]);
  }
  const on = LANE_NAMES.filter((name) => verdict[name]);
  const count = files === 'all' ? 'every file' : `${files.length} file(s)`;
  summary(`**Lanes** (${count} changed): ${on.length > 0 ? on.join(', ') : 'none'}`);
}

function publishRust({ shards, components, audit }: Reach): void {
  setOutput('rust_shards', JSON.stringify(shards));
  setOutput('components', components.length > 0);
  setOutput('components_only', components.join(','));
  setOutput('audit', audit.length > 0);
  setOutput('audit_only', audit.join(','));
  if (shards.length === 0 && audit.length === 0) {
    return;
  }
  const jobs = [
    ...shards.map((shard) => `- ${shard.name}: ${shard.workspaces.join(', ')}`),
    `- modules as components: ${components.join(', ') || 'none'}`,
    `- module audit: ${audit.join(', ') || 'none'}`,
  ];
  summary(`**Rust jobs**\n\n${jobs.join('\n')}`);
}
