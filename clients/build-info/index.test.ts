// Which build this is.
//
// Only the BUILD can know any of it - there is no git and no filesystem on a
// phone or a television - so it is collected once, in Node, and carried into the
// bundle. Two things here are worth more than the rest.
//
// `browsableRemote` produces a string that is SHOWN on a settings screen and
// handed to the system browser, and its input is a git remote, which routinely
// carries a credential: a CI checkout's origin is often
// `https://x-access-token:<token>@github.com/owner/repo`. Passing that through
// prints a token on a television and puts it in whatever the browser logs. The
// credential is dropped, and that is tested for every spelling a remote comes
// in.
//
// And every git field degrades to null rather than throwing, because a build
// from a source tarball - or a CI checkout with no `.git` - still has to produce
// an app. It just has less to say, and the consumer hides those rows. The tests
// use a real temporary repository and a real directory that is not one, because
// what is being checked is exactly what `git` does in each case.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browsableRemote, collectBuildInfo, productVersion } from './index';

const work = mkdtempSync(join(tmpdir(), 'kroma-build-info-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let made = 0;

/** A directory holding a package.json, optionally a git repository. */
function project(options: { git?: boolean; remote?: string; version?: string } = {}): string {
  made += 1;
  const dir = join(work, `proj-${made}`);
  execFileSync('mkdir', ['-p', dir]);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: options.version ?? '1.2.3' }));
  if (options.git) {
    const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    run('init', '-q');
    run('config', 'user.email', 'test@kroma.test');
    run('config', 'user.name', 'Test');
    run('config', 'commit.gpgsign', 'false');
    if (options.remote) run('remote', 'add', 'origin', options.remote);
    writeFileSync(join(dir, 'a.txt'), 'hello');
    run('add', '.');
    run('commit', '-q', '-m', 'first');
  }
  return dir;
}

describe('browsableRemote', () => {
  it('converts the scp-style remote `git clone git@…` writes', () => {
    // No scheme at all, which is why it needs its own pattern.
    expect(browsableRemote('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo');
  });

  it('converts an ssh:// remote', () => {
    expect(browsableRemote('ssh://git@github.com/owner/repo')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('converts a git:// remote', () => {
    expect(browsableRemote('git://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('leaves an https remote browsable', () => {
    expect(browsableRemote('https://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('DROPS an embedded credential', () => {
    // A CI checkout's origin looks exactly like this. Shown on a settings
    // screen, it prints a token on a television.
    expect(browsableRemote('https://x-access-token:ghs_SECRET@github.com/owner/repo')).toBe(
      'https://github.com/owner/repo',
    );
    expect(browsableRemote('https://user:password@gitlab.com/owner/repo.git')).toBe(
      'https://gitlab.com/owner/repo',
    );
  });

  it('drops a credential from the ssh spelling too', () => {
    expect(browsableRemote('ssh://git@git.example.test:2222/owner/repo')).toBe(
      'https://git.example.test:2222/owner/repo',
    );
  });

  it('never returns a string still holding an @', () => {
    for (const remote of [
      'git@github.com:owner/repo.git',
      'ssh://git@github.com/owner/repo',
      'https://x-access-token:ghs_SECRET@github.com/owner/repo',
      'https://user:pw@example.test/o/r',
    ]) {
      // The one property that matters, whatever the spelling: nothing before an
      // `@` survives into a URL handed to a browser.
      expect(browsableRemote(remote)).not.toContain('@');
    }
  });

  it('handles a self-hosted host and a nested path', () => {
    expect(browsableRemote('git@git.example.test:group/sub/repo.git')).toBe(
      'https://git.example.test/group/sub/repo',
    );
  });

  it('trims surrounding whitespace, as git output carries', () => {
    expect(browsableRemote('  git@github.com:owner/repo.git  ')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('answers null for nothing, and for something unbrowsable', () => {
    for (const remote of [null, undefined, '', '   ', '/srv/git/repo.git', 'not a remote']) {
      expect(browsableRemote(remote)).toBeNull();
    }
  });

  it('strips only a TRAILING .git', () => {
    // A repository legitimately named `repo.github` must survive.
    expect(browsableRemote('git@github.com:owner/repo.github')).toBe(
      'https://github.com/owner/repo.github',
    );
  });
});

describe('productVersion', () => {
  const original = process.env.KROMA_VERSION;
  beforeEach(() => {
    delete process.env.KROMA_VERSION;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.KROMA_VERSION;
    else process.env.KROMA_VERSION = original;
  });

  it('takes what CI stamped, above everything else', () => {
    process.env.KROMA_VERSION = '9.9.9';
    expect(productVersion(work)).toBe('9.9.9');
  });

  it('reads the repo’s single source of truth otherwise', () => {
    const root = join(work, 'repo-root');
    execFileSync('mkdir', ['-p', join(root, 'server')]);
    writeFileSync(
      join(root, 'server', 'Cargo.toml'),
      '[package]\nname = "kroma-server"\nversion = "0.1.36"\nedition = "2021"\n',
    );
    // So a LOCAL build reports the real product version too, rather than the
    // client's own package version.
    expect(productVersion(root)).toBe('0.1.36');
  });

  it('takes the FIRST version key, not one from a dependency', () => {
    const root = join(work, 'repo-deps');
    execFileSync('mkdir', ['-p', join(root, 'server')]);
    writeFileSync(
      join(root, 'server', 'Cargo.toml'),
      '[package]\nversion = "0.1.36"\n\n[dependencies]\nserde = { version = "1.0.200" }\n',
    );
    expect(productVersion(root)).toBe('0.1.36');
  });

  it('answers null when there is no Cargo.toml to read', () => {
    // Leaving the caller's own package version to stand.
    expect(productVersion(join(work, 'nowhere'))).toBeNull();
  });
});

describe('collectBuildInfo', () => {
  it('reports the commit, branch and remote of a real checkout', () => {
    const dir = project({ git: true, remote: 'git@github.com:owner/repo.git' });
    const info = collectBuildInfo(dir);

    expect(info.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(info.commitFull).toMatch(/^[0-9a-f]{40}$/);
    expect(info.commitFull?.startsWith(info.commit ?? '')).toBe(true);
    expect(info.branch).toBeTruthy();
    expect(info.repository).toBe('https://github.com/owner/repo');
  });

  it('reports a clean tree as clean, and a dirty one as dirty', () => {
    const dir = project({ git: true });
    expect(collectBuildInfo(dir).dirty).toBe(false);

    writeFileSync(join(dir, 'a.txt'), 'changed');
    // `dirty` drives a warning badge: the build's source is not the commit it
    // names.
    expect(collectBuildInfo(dir).dirty).toBe(true);
  });

  it('DEGRADES to null outside a checkout', () => {
    const dir = project({ git: false });
    const info = collectBuildInfo(dir);
    // A source tarball, or a CI checkout with no .git, still has to produce an
    // app - it just has less to say.
    expect(info.commit).toBeNull();
    expect(info.commitFull).toBeNull();
    expect(info.branch).toBeNull();
    expect(info.repository).toBeNull();
    expect(info.dirty).toBe(false);
  });

  it('still reports the version and a build date outside a checkout', () => {
    const info = collectBuildInfo(project({ git: false }));
    expect(info.version).toBe('1.2.3');
    expect(() => new Date(info.buildDate).toISOString()).not.toThrow();
  });

  it('takes the version from the project’s own package.json', () => {
    expect(collectBuildInfo(project({ version: '4.5.6' })).version).toBe('4.5.6');
  });

  it('lets an override win, which is how a TV reports the PRODUCT version', () => {
    expect(collectBuildInfo(project({ version: '1.2.3' }), { version: '0.1.36' }).version).toBe(
      '0.1.36',
    );
  });

  it('ignores a nullish override, so a caller can pass one unconditionally', () => {
    const dir = project({ version: '1.2.3' });
    expect(collectBuildInfo(dir, { version: null }).version).toBe('1.2.3');
    expect(collectBuildInfo(dir, {}).version).toBe('1.2.3');
  });

  it('falls back to 0.0.0 when the package has no version', () => {
    made += 1;
    const dir = join(work, `proj-${made}`);
    execFileSync('mkdir', ['-p', dir]);
    writeFileSync(join(dir, 'package.json'), '{}');
    // A version is shown on a settings screen; an empty one reads as a bug.
    expect(collectBuildInfo(dir).version).toBe('0.0.0');
  });

  it('never returns a repository URL holding a credential', () => {
    const dir = project({
      git: true,
      remote: 'https://x-access-token:ghs_SECRET@github.com/owner/repo',
    });
    expect(collectBuildInfo(dir).repository).toBe('https://github.com/owner/repo');
  });
});
