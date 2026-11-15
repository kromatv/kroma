import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { summary } from './actions';
import { readRepo } from './event';
import { root } from './root';
import { codeSummary, SnykCodeSarif } from './snyk-code';

const REPORT = join(root, '.sarif/snyk-code.sarif');
const SCANNED = new Set([0, 1]);

const publishing = () => {
  const { slug } = readRepo();
  return ['--report', `--project-name=${slug}`, `--remote-repo-url=https://github.com/${slug}`];
};

async function testCode(report: readonly string[]): Promise<void> {
  const args = ['code', 'test', `--sarif-file-output=${REPORT}`, ...report];
  mkdirSync(dirname(REPORT), { recursive: true });
  console.log(`\n=== snyk ${args.join(' ')}`);
  const { exitCode } = await $`snyk ${args}`.cwd(root).nothrow();
  if (!SCANNED.has(exitCode)) {
    throw new Error(`snyk code test ended ${exitCode}: the scan did not complete`);
  }
  summary(codeSummary(SnykCodeSarif.parse(JSON.parse(readFileSync(REPORT, 'utf8')))));
}

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { publish: { type: 'boolean', default: false } },
  });
  if (positionals[0] !== 'code') {
    throw new Error('usage: bun run ci snyk code [--publish]');
  }
  return testCode(values.publish ? publishing() : []);
}
