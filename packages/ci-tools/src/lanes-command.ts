import { parseArgs } from 'node:util';
import { setOutput, summary } from './actions';
import { changedFiles } from './changed-files';
import { readEvent, readRepo } from './event';
import { LANE_NAMES, type LaneName, matchLanes } from './lanes';

const isLane = (value: string): value is LaneName => (LANE_NAMES as string[]).includes(value);

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
  const verdict = matchLanes(files);

  if (values.lane !== undefined) {
    if (!isLane(values.lane)) throw new Error(`unknown lane '${values.lane}'`);
    console.log(String(verdict[values.lane]));
    process.exitCode = verdict[values.lane] ? 0 : 1;
    return;
  }

  if (values.json) {
    console.log(JSON.stringify({ files, lanes: verdict }, null, 2));
    return;
  }

  for (const name of LANE_NAMES) setOutput(name, verdict[name]);

  const on = LANE_NAMES.filter((name) => verdict[name]);
  const count = files === 'all' ? 'every file' : `${files.length} file(s)`;
  summary(`**Lanes** (${count} changed): ${on.length > 0 ? on.join(', ') : 'none'}`);
}
