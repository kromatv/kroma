import { describe, expect, it } from 'vitest';
import { archOf, feed, keysOf, signedBundles } from './desktop-feed';

const BASE = 'https://github.com/kromatv/kroma/releases/download/desktop-stable';
const AT = new Date('2026-10-28T12:00:00Z');

const bundles = [
  { name: 'mac/KROMA_0.1.40_aarch64.app.tar.gz', signature: 'mac-sig\n' },
  { name: 'intel/KROMA_0.1.40_x64.app.tar.gz', signature: 'intel-sig' },
  { name: 'nsis/KROMA_0.1.40_x64-setup.exe', signature: 'nsis-sig' },
  { name: 'msi/KROMA_0.1.40_x64_en-US.msi', signature: 'msi-sig' },
  { name: 'appimage/KROMA_0.1.40_amd64.AppImage', signature: 'appimage-sig' },
  { name: 'deb/KROMA_0.1.40_amd64.deb', signature: 'deb-sig' },
];

describe('archOf and keysOf', () => {
  it('reads the CPU off every bundle tauri names', () => {
    expect(bundles.map((b) => archOf(b.name))).toEqual([
      'aarch64',
      'x86_64',
      'x86_64',
      'x86_64',
      'x86_64',
      'x86_64',
    ]);
    expect(archOf('KROMA.app.tar.gz')).toBeNull();
  });

  it('answers the installer key first and the generic key for the default installer only', () => {
    expect(keysOf('KROMA_0.1.40_x64-setup.exe')).toEqual(['windows-x86_64-nsis', 'windows-x86_64']);
    expect(keysOf('KROMA_0.1.40_x64_en-US.msi')).toEqual(['windows-x86_64-msi']);
    expect(keysOf('KROMA_0.1.40_amd64.deb')).toEqual(['linux-x86_64-deb']);
    expect(keysOf('KROMA_0.1.40_aarch64.dmg')).toEqual([]);
  });
});

describe('signedBundles', () => {
  it('keeps the bundles with a signature beside them', () => {
    const paths = [
      'a/KROMA_0.1.40_aarch64.dmg',
      'a/KROMA_0.1.40_aarch64.app.tar.gz',
      'a/KROMA_0.1.40_aarch64.app.tar.gz.sig',
      'b/KROMA_0.1.40_amd64.deb',
      'b/KROMA.app.tar.gz',
    ];

    expect(signedBundles(paths)).toEqual([
      { bundle: 'a/KROMA_0.1.40_aarch64.app.tar.gz', sig: 'a/KROMA_0.1.40_aarch64.app.tar.gz.sig' },
    ]);
  });
});

describe('feed', () => {
  it('serves every bundle by name from the release, signature trimmed', () => {
    const latest = feed(bundles, '0.1.40', BASE, AT, 'KROMA 0.1.40');

    expect(latest.version).toBe('0.1.40');
    expect(latest.pub_date).toBe('2026-10-28T12:00:00.000Z');
    expect(Object.keys(latest.platforms).sort()).toEqual([
      'darwin-aarch64',
      'darwin-aarch64-app',
      'darwin-x86_64',
      'darwin-x86_64-app',
      'linux-x86_64',
      'linux-x86_64-appimage',
      'linux-x86_64-deb',
      'windows-x86_64',
      'windows-x86_64-msi',
      'windows-x86_64-nsis',
    ]);
    expect(latest.platforms['darwin-aarch64']).toEqual({
      signature: 'mac-sig',
      url: `${BASE}/KROMA_0.1.40_aarch64.app.tar.gz`,
    });
    expect(latest.platforms['windows-x86_64']?.url).toBe(`${BASE}/KROMA_0.1.40_x64-setup.exe`);
  });

  it('refuses a feed that would strand an OS', () => {
    const withoutMacs = bundles.filter((b) => !/^(mac|intel)\//.test(b.name));

    expect(() => feed(withoutMacs, '0.1.40', BASE, AT, '')).toThrow(
      'no bundle for darwin-aarch64, darwin-x86_64',
    );
  });

  it('refuses two bundles for one key and a file it does not know', () => {
    const twice = [...bundles, { name: 'KROMA_0.1.41_x64-setup.exe', signature: 's' }];

    expect(() => feed(twice, '0.1.40', BASE, AT, '')).toThrow(
      'two bundles answer windows-x86_64-nsis',
    );
    expect(() => feed([{ name: 'KROMA.zip', signature: 's' }], '0.1.40', BASE, AT, '')).toThrow(
      'KROMA.zip is not an update bundle',
    );
  });
});
