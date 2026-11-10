import { cp, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractZip, packZip } from '../../install/zip';
import { run } from '../../run';
import { createAuthorCertificate } from './certificate/authority';
import { writeProfile } from './certificate/profile';
import { signWidget } from './certificate/widget';
import { activeProfile } from './profiles';
import { duidAt } from './duid';
import { obtainCertificates } from './samsung/obtain';
import { coversSet, readSamsungProfile } from './samsung/profile';
import { profileFor, readDuid, resign } from './signing';

const { directories } = vi.hoisted(() => ({ directories: new Set<string>() }));

vi.mock('node:fs', () => ({
  statSync: (path: string) => ({ isDirectory: () => directories.has(path) }),
}));
vi.mock('node:fs/promises', () => ({
  cp: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
}));
vi.mock('../../install/zip', () => ({ extractZip: vi.fn(), packZip: vi.fn() }));
vi.mock('../../run', () => ({ run: vi.fn() }));
vi.mock('./certificate/authority', () => ({ createAuthorCertificate: vi.fn() }));
vi.mock('./certificate/password', () => ({ randomPassword: () => 'a-random-password' }));
vi.mock('./certificate/profile', () => ({ writeProfile: vi.fn() }));
vi.mock('./certificate/widget', () => ({ signWidget: vi.fn() }));
vi.mock('./profiles', () => ({ activeProfile: vi.fn() }));
vi.mock('./duid', () => ({ duidAt: vi.fn() }));
vi.mock('./samsung/obtain', () => ({ obtainCertificates: vi.fn() }));
vi.mock('./samsung/profile', () => ({
  readSamsungProfile: vi.fn(() => null),
  coversSet: vi.fn(() => false),
}));

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
});

afterEach(() => {
  vi.clearAllMocks();
});

const issued = {
  name: 'samsung',
  author: { key: '/kept/author.key', chain: '/kept/author.pem' },
  distributor: { key: '/kept/distributor.key', chain: '/kept/distributor.pem' },
};

const generated = {
  directory: '/certs/kroma',
  certificate: '/certs/kroma/kroma.crt',
  key: '/certs/kroma/kroma.key',
  archive: '/certs/kroma/kroma.p12',
  password: 'a-random-password',
  passwordFile: '/certs/kroma/kroma.pwd',
};

const terminal = process.stdin.isTTY;
const inTerminal = (value: boolean) =>
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });

describe('profileFor', () => {
  beforeEach(() => {
    vi.mocked(duidAt).mockResolvedValue('1900A2C4D6E8');
    vi.mocked(readSamsungProfile).mockReturnValue(null);
    vi.mocked(coversSet).mockReturnValue(false);
    vi.mocked(activeProfile).mockResolvedValue(null);
    vi.mocked(createAuthorCertificate).mockResolvedValue(generated);
    inTerminal(false);
  });

  afterEach(() => inTerminal(terminal));

  it('takes the certificates Samsung issued to this tool when they list the set', async () => {
    vi.mocked(readSamsungProfile).mockReturnValue(issued);
    vi.mocked(coversSet).mockReturnValue(true);

    expect(await profileFor('192.168.1.31', log)).toBe(issued);
    expect(vi.mocked(coversSet).mock.calls[0]?.[0]).toBe('1900A2C4D6E8');
    expect(vi.mocked(activeProfile)).not.toHaveBeenCalled();
  });

  it('takes the profile the Tizen tools sign with when Samsung issued none for the set', async () => {
    vi.mocked(readSamsungProfile).mockReturnValue(issued);
    vi.mocked(activeProfile).mockResolvedValue(kroma);

    expect(await profileFor('192.168.1.31', log)).toBe(kroma);
    expect(vi.mocked(obtainCertificates)).not.toHaveBeenCalled();
  });

  it('asks Samsung on the spot, in a terminal, for a set that has no certificate', async () => {
    inTerminal(true);
    vi.mocked(obtainCertificates).mockImplementation(async () => {
      vi.mocked(readSamsungProfile).mockReturnValue(issued);
      return {
        directory: '/kept',
        duids: ['1900A2C4D6E8'],
        authorUntil: new Date(),
        distributorUntil: new Date(),
      };
    });

    const profile = await profileFor('192.168.1.31', log);

    expect(profile).toBe(issued);
    expect(vi.mocked(obtainCertificates).mock.calls[0]?.[0]).toMatchObject({
      duid: '1900A2C4D6E8',
    });
    expect(lines).toEqual(['this set has no certificate from Samsung yet']);
  });

  it('asks nobody when no terminal is there to sign in from', async () => {
    await profileFor('192.168.1.31', log);

    expect(vi.mocked(obtainCertificates)).not.toHaveBeenCalled();
  });

  it('asks nobody for a set that would not say its DUID', async () => {
    inTerminal(true);
    vi.mocked(duidAt).mockResolvedValue(null);

    await profileFor('192.168.1.31', log);

    expect(vi.mocked(obtainCertificates)).not.toHaveBeenCalled();
  });

  it('asks nobody for a set that could not be reached, and leaves the install to say why', async () => {
    vi.mocked(duidAt).mockRejectedValue(new Error('the TV refused the connection'));
    vi.mocked(activeProfile).mockResolvedValue(kroma);

    expect(await profileFor('192.168.1.31', log)).toBe(kroma);
    expect(obtainCertificates).not.toHaveBeenCalled();
  });

  it('signs with certificates that list another set rather than with none', async () => {
    vi.mocked(readSamsungProfile).mockReturnValue(issued);

    expect(await profileFor('192.168.1.31', log)).toBe(issued);
    expect(vi.mocked(createAuthorCertificate)).not.toHaveBeenCalled();
  });

  it('generates an author certificate when asking Samsung kept nothing', async () => {
    inTerminal(true);
    vi.mocked(obtainCertificates).mockResolvedValue({
      directory: '/kept',
      duids: [],
      authorUntil: new Date(),
      distributorUntil: new Date(),
    });

    expect((await profileFor('192.168.1.31', log)).name).toBe('kroma');
  });

  it('generates an author certificate on a machine that has no profile', async () => {
    const profile = await profileFor('192.168.1.31', log);

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
    vi.mocked(writeProfile).mockRejectedValue(new Error('already holds profiles'));

    expect((await profileFor('192.168.1.31', log)).name).toBe('kroma');
  });
});

describe('resign', () => {
  it('unpacks the package it was given into a directory of its own', async () => {
    await resign('/out/KROMA-tizen-0.1.33.wgt', kroma, log);

    expect(vi.mocked(extractZip)).toHaveBeenCalledWith(
      '/out/KROMA-tizen-0.1.33.wgt',
      '/tmp/kroma-wgt-1/app',
    );
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
    expect(vi.mocked(extractZip)).not.toHaveBeenCalled();
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

    expect(vi.mocked(packZip)).toHaveBeenCalledWith(
      '/tmp/kroma-wgt-1/app',
      '/tmp/kroma-wgt-1/KROMA.wgt',
    );
    expect(signed).toEqual({ path: '/tmp/kroma-wgt-1/KROMA.wgt', staged: true });
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
