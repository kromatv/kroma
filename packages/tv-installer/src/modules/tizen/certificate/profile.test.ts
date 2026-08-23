import { randomInt } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { profilesXml } from './profile';

const author = { archive: '/home/max/.kroma/certificates/kroma/author.p12', password: 'kroma-dev' };

const bases: string[] = [];

function tizenData(): string {
  const base = mkdtempSync(join(tmpdir(), 'kroma-profile-'));
  bases.push(base);
  return join(base, `tizen-studio-data-${randomInt(1000, 9999)}`);
}

const profileName = () => `kroma-${randomInt(1000, 9999)}`;

async function writerUnder(data: string | undefined) {
  vi.stubEnv('TIZEN_DATA', data);
  vi.resetModules();
  return await import('./profile');
}

afterEach(() => vi.unstubAllEnvs());

afterAll(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

describe('profilesXml', () => {
  it('makes the profile it writes the active one', () => {
    expect(profilesXml({ name: 'kroma', author })).toContain('<profiles active="kroma"');
  });

  it('puts the author key in the slot the tools read it from', () => {
    const xml = profilesXml({ name: 'kroma', author });

    expect(xml).toContain(`distributor="0" key="${author.archive}" password="kroma-dev"`);
  });

  it('leaves the distributor slots empty when Samsung issued nothing', () => {
    const xml = profilesXml({ name: 'kroma', author });

    expect(xml).toContain('distributor="1" key="" password=""');
    expect(xml).toContain('distributor="2" key="" password=""');
  });

  it('carries a Samsung distributor certificate when there is one', () => {
    const distributor = {
      archive: '/home/max/SamsungCertificate/LUMA/distributor.p12',
      password: 'x',
    };

    const xml = profilesXml({ name: 'LUMA', author, distributor });

    expect(xml).toContain(`distributor="1" key="${distributor.archive}"`);
  });

  it('escapes what would otherwise close an attribute', () => {
    const xml = profilesXml({ name: 'a"b&c', author });

    expect(xml).toContain('active="a&quot;b&amp;c"');
  });
});

describe('writeProfile', () => {
  it('writes the profile where the Tizen tools read theirs from', async () => {
    const data = tizenData();
    const request = { name: profileName(), author };
    const { writeProfile } = await writerUnder(data);

    const path = await writeProfile(request);

    expect(path).toBe(join(data, 'profile', 'profiles.xml'));
    expect(readFileSync(path, 'utf8')).toBe(profilesXml(request));
  });

  it('refuses a profiles.xml that already holds someone else, and names it', async () => {
    const data = tizenData();
    const registered = profileName();
    const { writeProfile, PROFILES_XML } = await writerUnder(data);
    await mkdir(dirname(PROFILES_XML), { recursive: true });
    writeFileSync(PROFILES_XML, profilesXml({ name: registered, author }));

    await expect(writeProfile({ name: profileName(), author })).rejects.toThrow(PROFILES_XML);

    expect(readFileSync(PROFILES_XML, 'utf8')).toContain(`active="${registered}"`);
  });
});

describe('PROFILES_XML', () => {
  it('is the Tizen data directory the environment names', async () => {
    const data = tizenData();

    const { PROFILES_XML } = await writerUnder(data);

    expect(PROFILES_XML).toBe(join(data, 'profile', 'profiles.xml'));
  });

  it('falls back to the studio data directory in the home when nothing names one', async () => {
    const { PROFILES_XML } = await writerUnder(undefined);

    expect(PROFILES_XML).toBe(join(homedir(), 'tizen-studio-data', 'profile', 'profiles.xml'));
  });
});
