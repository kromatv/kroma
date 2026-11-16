import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findLingua, linguaAnswers, linguaUrl, projectOf } from './lingua.ts';

const made: string[] = [];

function repository(config: object | null): string {
  const root = mkdtempSync(join(tmpdir(), 'kroma-i18n-lingua-'));
  made.push(root);
  const shell = join(root, 'clients', 'web');
  mkdirSync(shell, { recursive: true });
  if (config) {
    writeFileSync(join(root, 'lingua.json'), JSON.stringify(config));
  }
  return shell;
}

const ORIGIN = async () => 'git@github.com:kromatv/kroma.git';

afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('the project a git remote names', () => {
  it.each([
    'https://github.com/kromatv/kroma.git',
    'https://github.com/kromatv/kroma',
    'https://github.com/kromatv/kroma/',
    'https://token@github.com/kromatv/kroma.git',
    'git@github.com:kromatv/kroma.git',
    'git@github.com:kromatv/kroma',
    'ssh://git@github.com/kromatv/kroma.git',
    'ssh://git@github.com:22/kromatv/kroma\n',
  ])('reads owner and repository off %s', (remote) => {
    expect(projectOf(remote)).toBe('kromatv/kroma');
  });

  it.each([
    '/srv/git/kroma.git',
    'file:///srv/kromatv/kroma.git',
    'https://gitlab.com/group/sub/kroma.git',
    'https://github.com/kromatv',
    'git@github.com:kromatv/kro ma.git',
  ])('names no project for %s', (remote) => {
    expect(projectOf(remote)).toBeNull();
  });
});

describe('the site a lingua.json names', () => {
  it('keeps an https url without its trailing slash', () => {
    expect(linguaUrl({ url: 'https://lingua.kroma.tv/', projects: [] })).toBe(
      'https://lingua.kroma.tv',
    );
  });

  it.each([
    { url: 'http://lingua.kroma.tv' },
    { url: 'javascript:alert(1)' },
    { url: 'lingua.kroma.tv' },
    { projects: [] },
    null,
  ])('refuses %j', (config) => {
    expect(linguaUrl(config)).toBeNull();
  });
});

describe('where a repository translates', () => {
  it('reads the lingua.json above the dev server root and the project its origin names', async () => {
    const root = repository({ url: 'https://lingua.kroma.tv' });

    const lingua = await findLingua(root, ORIGIN);

    expect(lingua).toEqual({ url: 'https://lingua.kroma.tv', project: 'kromatv/kroma' });
  });

  it('says nothing for a repository with no lingua.json', async () => {
    const root = repository(null);

    expect(await findLingua(root, ORIGIN)).toBeNull();
  });

  it('says nothing for a lingua.json that is not https', async () => {
    const root = repository({ url: 'http://lingua.kroma.tv' });

    expect(await findLingua(root, ORIGIN)).toBeNull();
  });

  it('says nothing for a repository with no remote', async () => {
    const root = repository({ url: 'https://lingua.kroma.tv' });

    expect(await findLingua(root, async () => null)).toBeNull();
  });
});

describe('answering the page', () => {
  it('works the answer out once and gives it to every ask', async () => {
    const root = repository({ url: 'https://lingua.kroma.tv' });
    const origin = vi.fn(ORIGIN);
    const answer = linguaAnswers(root, origin);

    const said = await Promise.all([answer({ at: 1 }), answer({ at: 2 })]);

    expect(origin).toHaveBeenCalledTimes(1);
    expect(said.map((one) => one?.at)).toEqual([1, 2]);
    expect(said[1]?.lingua).toEqual({ url: 'https://lingua.kroma.tv', project: 'kromatv/kroma' });
  });

  it('reads the project off the origin of the repository the config sits in', async () => {
    const root = repository({ url: 'https://lingua.kroma.tv' });
    const top = join(root, '..', '..');
    execFileSync('git', ['init', '-q'], { cwd: top });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/kromatv/kroma.git'], {
      cwd: top,
    });

    const said = await linguaAnswers(root)({ at: 1 });

    expect(said).toEqual({
      at: 1,
      lingua: { url: 'https://lingua.kroma.tv', project: 'kromatv/kroma' },
    });
  });

  it('works nothing out for an ask with nothing to answer under', async () => {
    const origin = vi.fn(ORIGIN);

    const said = await linguaAnswers(repository({ url: 'https://lingua.kroma.tv' }), origin)({});

    expect([said, origin.mock.calls]).toEqual([null, []]);
  });
});
