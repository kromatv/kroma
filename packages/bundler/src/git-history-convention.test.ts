// The grouping in git-history-parse.ts keys every component off its story file,
// so the suffix it looks for has to be the suffix the kit actually writes. The
// other tests here all supply their own fixtures, which means they agree with
// whatever the constant says and cannot notice when the two drift apart: the
// suffix sat at `.stories.tsx` for the whole of the `.story.mdx` migration, and
// ui.kroma.tv shipped "no history to list" while every test stayed green.
//
// This one reads the real tree instead, so the constant is pinned to the repo.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { groupFiles } from './git-history-parse.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const ROOT = 'packages/ui/src';

function tree(dir: string, prefix: string, out: string[] = []): string[] {
  for (const entry of readdirSync(`${REPO}${dir}`, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) tree(path, prefix, out);
    else out.push(path);
  }
  return out;
}

describe('the story suffix the grouping keys on', () => {
  const files = tree(ROOT, ROOT);

  it('finds the kit its stories', () => {
    expect(files.length).toBeGreaterThan(0);
    const groups = groupFiles(files);
    expect(groups.size).toBeGreaterThan(0);
  });

  it('groups nearly every file in the kit under one of them', () => {
    const groups = groupFiles(files);
    const grouped = new Set([...groups.values()].flat());
    // Not all of it: assets and a few top-level modules sit above any story.
    expect(grouped.size).toBeGreaterThan(files.length / 2);
  });
});
