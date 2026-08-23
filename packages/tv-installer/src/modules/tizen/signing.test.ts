import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run, runOk } from '../../run';
import { createAuthorCertificate } from './certificate/authority';
import { writeProfile } from './certificate/profile';
import { signWidget } from './certificate/widget';
import { activeProfile } from './profiles';
import { ensureProfile, readDuid, resign } from './signing';

const { directories } = vi.hoisted(() => ({ directories: new Set<string>() }));

vi.mock('node:fs', () => ({
  statSync: (path: string) => ({ isDirectory: () => directories.has(path) }),
}));
vi.mock('node:fs/promises', () => ({
  cp: vi.fn(),
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
}));
vi.mock('../../run', () => ({ run: vi.fn(), runOk: vi.fn() }));
vi.mock('./certificate/authority', () => ({ createAuthorCertificate: vi.fn() }));
vi.mock('./certificate/password', () => ({ randomPassword: () => 'a-random-password' }));
vi.mock('./certificate/profile', () => ({ writeProfile: vi.fn() }));
vi.mock('./certificate/widget', () => ({ signWidget: vi.fn() }));
vi.mock('./profiles', () => ({ activeProfile: vi.fn() }));

const kroma = {
  name: 'kroma',
  author: { archive: '/certs/author.p12', password: 'secret' },
  distributor: { archive: '/certs/distributor.p12', password: 'other' },
};

const lines: string[] = [];
const log = (line: string) => lines.push(line);

beforeEach(() => {
  lines.length = 0;
  directories.clear();
  vi.mocked(mkdtemp).mockResolvedValue('/tmp/kroma-wgt-1');
  vi.mocked(writeProfile).mockResolvedValue('/tizen-studio-data/profile/profiles.xml');
  vi.stubGlobal('Bun', { which: () => '/usr/bin/zip' });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ensureProfile', () => {
  it('takes the profile the Tizen tools already sign with', async () => {
    vi.mocked(activeProfile).mockResolvedValue(kroma);

    expect(await ensureProfile(log)).toBe(kroma);
    expect(vi.mocked(createAuthorCertificate)).not.toHaveBeenCalled();
  });

  it('generates an author certificate on a machine that has no profile', async () => {
    vi.mocked(activeProfile).mockResolvedValue(null);
    vi.mocked(createAuthorCertificate).mockResolvedValue({
      directory: '/certs/kroma',
      certificate: '/certs/kroma/kroma.crt',
      key: '/certs/kroma/kroma.key',
      archive: '/certs/kroma/kroma.p12',
      password: 'a-random-password',
      passwordFile: '/certs/kroma/kroma.pwd',
    });

    const profile = await ensureProfile(log);

    expect(vi.mocked(createAuthorCertificate)).toHaveBeenCalledWith({
      directory: join(homedir(), '.kroma', 'certificates', 'kroma'),
      alias: 'kroma',
      password: 'a-random-password',
      subject: { commonName: 'KROMA', organization: 'KROMA' },
    });
    expect(profile).toEqual({
      name: 'kroma',
      author: { archive: '/certs/kroma/kroma.p12', password: 'a-random-password' },
    });
    expect(vi.mocked(writeProfile)).toHaveBeenCalledWith(profile);
  });

  it('signs with the generated profile even when the Tizen file refused it', async () => {
    vi.mocked(activeProfile).mockResolvedValue(null);
    vi.mocked(createAuthorCertificate).mockResolvedValue({
      directory: '/certs/kroma',
      certificate: '/certs/kroma/kroma.crt',
      key: '/certs/kroma/kroma.key',
      archive: '/certs/kroma/kroma.p12',
      password: 'a-random-password',
      passwordFile: '/certs/kroma/kroma.pwd',
    });
    vi.mocked(writeProfile).mockRejectedValue(new Error('already holds profiles'));

    expect((await ensureProfile(log)).name).toBe('kroma');
  });
});

describe('resign', () => {
  it('unpacks the package it was given into a directory of its own', async () => {
    await resign('/out/KROMA-tizen-0.1.33.wgt', kroma, log);

    expect(vi.mocked(mkdir)).toHaveBeenCalledWith('/tmp/kroma-wgt-1/app', { recursive: true });
    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual([
      'unzip',
      '-q',
      '-o',
      '/out/KROMA-tizen-0.1.33.wgt',
      '-d',
      '/tmp/kroma-wgt-1/app',
    ]);
  });

  it('copies a build that is already a directory instead of unpacking it', async () => {
    directories.add('/kroma/clients/tizen/dist');

    await resign('/kroma/clients/tizen/dist', kroma, log);

    expect(vi.mocked(cp)).toHaveBeenCalledWith(
      '/kroma/clients/tizen/dist',
      '/tmp/kroma-wgt-1/app',
      {
        recursive: true,
      },
    );
    expect(vi.mocked(runOk).mock.calls[0]?.[0]).not.toContain('unzip');
  });

  it('drops the signatures the build carried before it signs again', async () => {
    await resign('/out/KROMA.wgt', kroma, log);

    expect(vi.mocked(rm).mock.calls.map(([path]) => path)).toEqual([
      '/tmp/kroma-wgt-1/app/author-signature.xml',
      '/tmp/kroma-wgt-1/app/signature1.xml',
      '/tmp/kroma-wgt-1/app/signature2.xml',
    ]);
  });

  it('signs the staged widget with both keys the profile carries', async () => {
    await resign('/out/KROMA.wgt', kroma, log);

    expect(vi.mocked(signWidget)).toHaveBeenCalledWith({
      directory: '/tmp/kroma-wgt-1/app',
      author: kroma.author,
      distributor: kroma.distributor,
    });
    expect(lines[0]).toBe('signing with profile kroma');
  });

  it('packs the signed directory back into a widget the caller has to delete', async () => {
    const signed = await resign('/out/KROMA.wgt', kroma, log);

    expect(vi.mocked(runOk).mock.calls.at(-1)).toEqual([
      ['zip', '-X', '-r', '-q', '/tmp/kroma-wgt-1/KROMA.wgt', '.'],
      { cwd: '/tmp/kroma-wgt-1/app', log },
    ]);
    expect(signed).toEqual({ path: '/tmp/kroma-wgt-1/KROMA.wgt', staged: true });
  });

  it('refuses to repack on a machine with nothing to zip with', async () => {
    vi.stubGlobal('Bun', { which: () => null });

    await expect(resign('/out/KROMA.wgt', kroma, log)).rejects.toThrow(
      'zip is needed to repack the widget and is not here',
    );
  });
});

describe('readDuid', () => {
  it('reads off the set the id Samsung binds a certificate to', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: 'getduid\n1002XYZABC\n' });

    expect(await readDuid('/tizen-studio/tools/sdb', log)).toBe('1002XYZABC');
    expect(vi.mocked(run).mock.calls[0]?.[0]).toEqual([
      '/tizen-studio/tools/sdb',
      'shell',
      '0',
      'getduid',
    ]);
  });

  it('answers nothing when the set would not say', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, output: 'device not found' });

    expect(await readDuid('/tizen-studio/tools/sdb', log)).toBeNull();
  });

  it('answers nothing when the set answered with nothing at all', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: '' });

    expect(await readDuid('/tizen-studio/tools/sdb', log)).toBeNull();
  });
});
