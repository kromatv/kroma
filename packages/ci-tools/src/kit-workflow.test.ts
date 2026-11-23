import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { root } from './root';
import { closure, readWorkspaces } from './testflight/app-inputs';

const WORKFLOW = '.github/workflows/kit.yml';

const workflow = readFileSync(join(root, WORKFLOW), 'utf8');

const kit = closure('@kromatv/kit', readWorkspaces());

function pathFilters(text: string): string[][] {
  return [...text.matchAll(/^ {4}paths:\n((?: {6}- '[^'\n]+'\n)+)/gm)].map((filter) =>
    [...(filter[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1] ?? ''),
  );
}

function skipCheckPaths(text: string): string[] {
  return /git diff --quiet "\$last" HEAD -- (.+?) 2>/.exec(text)?.[1]?.split(' ') ?? [];
}

describe('kit.yml', () => {
  it('builds a pull request that changes any workspace package the kit depends on', () => {
    const globs = [...kit.map((dir) => `${dir}/**`), WORKFLOW];

    expect(pathFilters(workflow)).toEqual([globs]);
  });

  it('starts on every push to main, so a push of more than 300 files is never filtered out', () => {
    expect(workflow).toMatch(/^ {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n/m);
  });

  it('redeploys when any of those packages changed since the last deployed commit', () => {
    expect(skipCheckPaths(workflow)).toEqual([...kit, WORKFLOW]);
  });
});
