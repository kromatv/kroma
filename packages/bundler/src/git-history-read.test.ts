import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { historyFingerprint, NO_HISTORY, readGitHistory } from './git-history-read';

const ROOT = 'kit/src';
const STORY = `${ROOT}/button/button.story.mdx`;
const MOVED = `${ROOT}/atoms/button/button.story.mdx`;
const PAGE = `${ROOT}/guides/01-intro.page.mdx`;

let repo = '';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

function write(path: string, text: string): void {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

// Dated a minute apart, so the order the commits come back in is the one this
// file wrote them in rather than whatever a tie within one second settles on.
let minute = 0;

function commit(subject: string): void {
  minute += 1;
  const at = new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
  git('add', '-A');
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Kit',
      '-c',
      'user.email=kit@kroma.tv',
      'commit',
      '--no-gpg-sign',
      '-m',
      subject,
    ],
    {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at },
    },
  );
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'kroma-git-history-'));
  git('init', '-b', 'main');
  write(STORY, 'export default {}\n');
  write(`${ROOT}/button/button.tsx`, 'export const Button = null\n');
  write(PAGE, '# Intro\n');
  commit('feat: the button');

  // A folder restructure: the component's history has to survive its new path.
  mkdirSync(join(repo, ROOT, 'atoms'), { recursive: true });
  git('mv', `${ROOT}/button`, `${ROOT}/atoms/button`);
  commit('refactor: the six levels');

  write(MOVED, 'export default { name: "Button" }\n');
  commit('fix: the button story names itself');
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe('readGitHistory', () => {
  it('keys a component by its story and an article by its own file', async () => {
    const history = await readGitHistory({ repo, root: ROOT });
    expect(Object.keys(history.entries).sort()).toEqual([MOVED, PAGE]);
    expect(history.shallow).toBe(false);
  });

  it('follows a rename, so a moved component keeps the date it was written', async () => {
    const { entries } = await readGitHistory({ repo, root: ROOT });
    const button = entries[MOVED];
    expect(button?.commits.map((one) => one.subject)).toEqual([
      'fix: the button story names itself',
      'refactor: the six levels',
      'feat: the button',
    ]);
    expect(Date.parse(button?.created ?? '')).toBeLessThanOrEqual(
      Date.parse(button?.changed ?? ''),
    );
  });

  it('counts the whole folder as the component, tests and all', async () => {
    write(`${ROOT}/atoms/button/button.test.ts`, 'it("renders", () => {})\n');
    commit('test: the button');
    const { entries } = await readGitHistory({ repo, root: ROOT });
    expect(entries[MOVED]?.commits[0]?.subject).toBe('test: the button');
  });

  it('marks an uncommitted edit dirty without inventing a commit for it', async () => {
    write(PAGE, '# Intro\n\nOne more line.\n');
    const { entries } = await readGitHistory({ repo, root: ROOT });
    expect(entries[PAGE]?.dirty).toBe(true);
    expect(entries[MOVED]?.dirty).toBe(false);
    git('checkout', '--', PAGE);
  });

  it('lists something that exists only in the working tree with no dates at all', async () => {
    write(`${ROOT}/atoms/chip/chip.story.mdx`, 'export default {}\n');
    const { entries } = await readGitHistory({ repo, root: ROOT });
    const chip = entries[`${ROOT}/atoms/chip/chip.story.mdx`];
    expect(chip).toEqual({ dirty: true, commits: [] });
    rmSync(join(repo, ROOT, 'atoms/chip'), { recursive: true, force: true });
  });

  it('reads nothing at all from a shallow clone', async () => {
    const shallow = mkdtempSync(join(tmpdir(), 'kroma-git-shallow-'));
    try {
      execFileSync('git', ['clone', '--depth', '1', `file://${repo}`, shallow], {
        stdio: 'ignore',
      });
      // The earliest commit such a clone holds is not the one a file was written
      // in, and a creation date that is merely the depth of the fetch is worse
      // than no date at all.
      expect(await readGitHistory({ repo: shallow, root: ROOT })).toEqual({
        ...NO_HISTORY,
        shallow: true,
      });
    } finally {
      rmSync(shallow, { recursive: true, force: true });
    }
  });
});

describe('historyFingerprint', () => {
  it('moves when the working tree does, and holds still otherwise', async () => {
    const before = await historyFingerprint({ repo, root: ROOT });
    expect(await historyFingerprint({ repo, root: ROOT })).toBe(before);
    write(`${ROOT}/atoms/button/button.tsx`, 'export const Button = undefined\n');
    expect(await historyFingerprint({ repo, root: ROOT })).not.toBe(before);
    git('checkout', '--', `${ROOT}/atoms/button/button.tsx`);
    expect(await historyFingerprint({ repo, root: ROOT })).toBe(before);
  });
});
