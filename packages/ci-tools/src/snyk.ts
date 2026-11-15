import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { z } from 'zod';
import { summary } from './actions';
import { readRepo } from './event';
import { type Alias, aliasesOf, keyAliases } from './key-aliases';
import { root } from './root';
import { codeSummary, DependencyReport, dependencySummary, oneRun, SarifLog } from './snyk-results';

const REPORTS = join(root, '.snyk-reports');
const SCANNED = [0, 1];
const PUBLISHED = [0];

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

async function snyk(args: string[], passing: readonly number[]): Promise<void> {
  console.log(`\n=== snyk ${args.join(' ')}`);
  const { exitCode } = await $`snyk ${args}`.cwd(root).nothrow();
  if (!passing.includes(exitCode)) {
    throw new Error(
      `snyk ${args.slice(0, 2).join(' ')} ended ${exitCode}: the scan did not complete`,
    );
  }
}

const repoUrl = () => `https://github.com/${readRepo().slug}`;

const Root = z.object({ workspaces: z.array(z.string()) });

function workspaceAliases(): Alias[] {
  const { workspaces } = Root.parse(readJson(join(root, 'package.json')));
  const manifests = workspaces.flatMap((glob) =>
    Array.from(new Bun.Glob(`${glob}/package.json`).scanSync({ cwd: root })),
  );
  return ['package.json', ...manifests].flatMap((file) => aliasesOf(readJson(join(root, file))));
}

function prepareYarnLock(): void {
  const yarn = join(root, 'yarn.lock');
  if (!existsSync(yarn) || statSync(yarn).mtimeMs < statSync(join(root, 'bun.lock')).mtimeMs) {
    throw new Error('yarn.lock is missing or older than bun.lock: run `bun install --yarn` first');
  }
  writeFileSync(yarn, keyAliases(readFileSync(yarn, 'utf8'), workspaceAliases()));
}

async function testDependencies(): Promise<void> {
  prepareYarnLock();
  const json = join(REPORTS, 'open-source.json');
  const sarif = join(REPORTS, 'open-source.sarif');
  await snyk(
    ['test', '--yarn-workspaces', `--json-file-output=${json}`, `--sarif-file-output=${sarif}`],
    SCANNED,
  );
  writeFileSync(sarif, JSON.stringify(oneRun(SarifLog.parse(readJson(sarif)))));
  summary(dependencySummary(DependencyReport.parse(readJson(json))));
}

const monitorDependencies = () =>
  snyk(['monitor', '--yarn-workspaces', `--remote-repo-url=${repoUrl()}`], PUBLISHED);

const codeReport = () => [
  '--report',
  `--project-name=${readRepo().slug}`,
  `--remote-repo-url=${repoUrl()}`,
];

async function testCode(report: readonly string[]): Promise<void> {
  const sarif = join(REPORTS, 'code.sarif');
  await snyk(['code', 'test', `--sarif-file-output=${sarif}`, ...report], SCANNED);
  summary(codeSummary(SarifLog.parse(readJson(sarif))));
}

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { publish: { type: 'boolean', default: false } },
  });
  const [scan] = positionals;
  mkdirSync(REPORTS, { recursive: true });
  if (scan === 'dependencies') {
    await testDependencies();
    if (values.publish) {
      await monitorDependencies();
    }
    return;
  }
  if (scan === 'code') {
    return testCode(values.publish ? codeReport() : []);
  }
  throw new Error('usage: bun run ci snyk <dependencies|code> [--publish]');
}
