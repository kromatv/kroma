import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../run';
import { parseProfiles, readProfile } from './profiles';

vi.mock('node:fs', () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock('../../run', () => ({ run: vi.fn() }));
vi.mock('./certificate/profile', () => ({ PROFILES_XML: '/tizen-data/profile/profiles.xml' }));

const xml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
  '<profiles active="LUMA" version="3.1">',
  '<profile name="emulator">',
  '<profileitem ca="" distributor="0" key="/keys/emulator.p12" password="secret" rootca=""/>',
  '</profile>',
  '<profile name="LUMA">',
  '<profileitem ca="" distributor="0" key="/certs/author.p12" password="/certs/author.pwd" rootca=""/>',
  '<profileitem ca="" distributor="1" key="/certs/distributor.p12" password="/certs/dist.pwd" rootca=""/>',
  '<profileitem ca="" distributor="2" key="" password="" rootca=""/>',
  '</profile>',
  '</profiles>',
].join('\n');

const onDisk = new Map<string, string>();

beforeEach(() => {
  onDisk.clear();
  onDisk.set('/tizen-data/profile/profiles.xml', xml);
  vi.mocked(existsSync).mockImplementation((path) => onDisk.has(String(path)));
  vi.mocked(readFileSync).mockImplementation((path) => onDisk.get(String(path)) ?? '');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('parseProfiles', () => {
  it('names the profile the tools sign with', () => {
    expect(parseProfiles(xml).active).toBe('LUMA');
  });

  it('reads every profile in the file, not only the active one', () => {
    expect([...parseProfiles(xml).profiles.keys()]).toEqual(['emulator', 'LUMA']);
  });

  it('keeps the author and distributor keys apart by their slot', () => {
    const items = parseProfiles(xml).profiles.get('LUMA');

    expect(items?.get('0')).toEqual({ key: '/certs/author.p12', password: '/certs/author.pwd' });
    expect(items?.get('1')?.key).toBe('/certs/distributor.p12');
  });

  it('leaves out a slot that names no key', () => {
    expect(parseProfiles(xml).profiles.get('LUMA')?.has('2')).toBe(false);
  });

  it('answers nothing for a file with no profile in it', () => {
    expect(parseProfiles('<profiles active="" version="3.1"></profiles>').profiles.size).toBe(0);
  });
});

describe('readProfile', () => {
  it('answers nothing on a machine the Tizen tools never wrote a profile on', async () => {
    onDisk.clear();

    expect(await readProfile()).toBeNull();
  });

  it('reads the active profile with both of the keys it carries', async () => {
    onDisk.set('/certs/author.pwd', 'author-password\n');
    onDisk.set('/certs/dist.pwd', 'distributor-password\n');

    expect(await readProfile()).toEqual({
      name: 'LUMA',
      author: { archive: '/certs/author.p12', password: 'author-password' },
      distributor: { archive: '/certs/distributor.p12', password: 'distributor-password' },
    });
  });

  it('reads the profile it was named rather than the active one', async () => {
    const profile = await readProfile('emulator');

    expect(profile?.name).toBe('emulator');
    expect(profile?.author).toEqual({ archive: '/keys/emulator.p12', password: 'secret' });
    expect(profile?.distributor).toBeUndefined();
  });

  it('answers nothing for a profile the file does not carry', async () => {
    expect(await readProfile('ghost')).toBeNull();
  });

  it('asks the login keychain for a password no file beside the certificate holds', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: 'kept-in-the-keychain\n' });

    const profile = await readProfile('LUMA');

    expect(vi.mocked(run).mock.calls[0]?.[0]).toEqual([
      'security',
      'find-generic-password',
      '-a',
      '/certs/author.pwd',
      '-w',
    ]);
    expect(profile?.author.password).toBe('kept-in-the-keychain');
  });

  it('signs with an empty password when the keychain holds none either', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, output: 'The specified item could not be found' });

    expect((await readProfile('LUMA'))?.author.password).toBe('');
  });
});
