import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gitHistory } from './git-history';

const RESOLVED = '\0virtual:kroma-history';
const ROOT = 'kit/src';
const STORY = `${ROOT}/button/button.story.mdx`;

interface Hooks {
  load: (id: string) => Promise<string | null>;
}

let repo = '';

function checkout(): string {
  repo = mkdtempSync(join(tmpdir(), 'kroma-git-history-plugin-'));
  mkdirSync(join(repo, ROOT, 'button'), { recursive: true });
  writeFileSync(join(repo, STORY), 'export default {}\n');
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
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
      'feat: the button',
    ],
    { cwd: repo, stdio: 'ignore' },
  );
  return repo;
}

const plugin = (at: string): Hooks => gitHistory({ repo: at, root: ROOT }) as unknown as Hooks;

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
  repo = '';
});

describe('gitHistory', { timeout: 30_000 }, () => {
  it('serves what git said as `HISTORY`', async () => {
    const code = await plugin(checkout()).load(RESOLVED);
    expect(code).toContain('export const HISTORY =');
    expect(code).toContain(STORY);
    expect(code).toContain('feat: the button');
  });

  it('serves an empty history off a checkout rather than failing the build', async () => {
    // A build made from a tarball, or with no git on the path, still builds - it
    // just has nothing to say about when anything was written.
    repo = mkdtempSync(join(tmpdir(), 'kroma-git-history-none-'));
    expect(await plugin(repo).load(RESOLVED)).toBe(
      'export const HISTORY = {"entries":{},"shallow":false};',
    );
  });
});
