import { describe, expect, it } from 'vitest';
import { classify, TARGET_IDS, TARGETS } from './release-targets.ts';

const PRODUCT = {
  'KROMA-tizen-0.1.40.tpk': 'tizen',
  'KROMA-tizen-0.1.38.wgt': 'tizen-web',
  'KROMA-webos-0.1.40.ipk': 'webos',
  'KROMA-androidtv-0.1.38.apk': 'androidtv',
  'KROMA_0.1.38_aarch64.dmg': 'macos',
  'KROMA_0.1.38_x64.dmg': 'macos-intel',
  'KROMA_0.1.38_x64-setup.exe': 'windows-exe',
  'KROMA_0.1.38_x64_en-US.msi': 'windows-msi',
  'KROMA_0.1.38_amd64.AppImage': 'linux-appimage',
  'KROMA_0.1.38_amd64.deb': 'linux-deb',
  'KROMA-mobile-0.1.38.apk': 'android',
  'kroma-0.1.38.3480473-x86_64.spk': 'synology',
} as const;

const NOT_OFFERED = [
  'kroma-0.1.38.3480473-x86_64.spk.info.json',
  'KROMA-appletv-0.1.38.ipa',
  'KROMA-mobile-0.1.38.ipa',
  'modules.json',
  'latest.json',
  'tv.kroma.scene.kmod',
  'tv.kroma.whisper-x86_64-unknown-linux-musl.kmod',
  'tv.kroma.whisper-x86_64-unknown-linux-musl.kmod.sha256',
  'tv.kroma.whisper-x86_64-unknown-linux-musl.kmod.tarsha',
  'KROMA_0.1.39-3490257_aarch64.app.tar.gz',
  'KROMA_0.1.39-3490257_aarch64.app.tar.gz.sig',
  'KROMA_0.1.39-3490257_x64.app.tar.gz',
  'KROMA-desktop-THIRD-PARTY-NOTICES.txt',
  'SHA256SUMS',
  'KROMA_0.1.39-3490257_amd64.AppImage.sig',
  'KROMA_0.1.39-3490257_amd64.deb.sig',
  'KROMA_0.1.39-3490257_x64-setup.exe.sig',
  'tv.kroma.webos_0.1.38_all.ipk',
  'KROMA-tizen-store-0.1.38.wgt',
  'KROMA-tizen8-0.1.38.wgt',
  'KROMA-tizen4to7-0.1.38.wgt',
];

describe('classify', () => {
  it('names the platform of every product asset a release carries', () => {
    for (const [asset, target] of Object.entries(PRODUCT)) {
      expect(classify(asset), asset).toBe(target);
    }
  });

  it('leaves a checksum, a signature and a sidecar unclaimed', () => {
    for (const asset of NOT_OFFERED) {
      expect(classify(asset), asset).toBeNull();
    }
  });

  it('offers the native Samsung and LG apps, and keeps the web .wgt apart for older sets', () => {
    expect(classify('KROMA-tizen-0.1.40-canary.3571200.tpk')).toBe('tizen');
    expect(classify('KROMA-tizen-0.1.40-canary.3571200.wgt')).toBe('tizen-web');
    expect(classify('KROMA-webos-0.1.40-canary.3571200.ipk')).toBe('webos');
  });

  it('tells the two apk builds apart', () => {
    expect(classify('KROMA-androidtv-0.1.38.apk')).toBe('androidtv');
    expect(classify('KROMA-mobile-0.1.38.apk')).toBe('android');
  });

  it('claims the rolling desktop channel, whose builds carry a stamped version', () => {
    expect(classify('KROMA_0.1.39-3490257_aarch64.dmg')).toBe('macos');
    expect(classify('KROMA_0.1.39-3490257_x64.dmg')).toBe('macos-intel');
    expect(classify('KROMA_0.1.39-3490257_amd64.AppImage')).toBe('linux-appimage');
  });

  it('offers exactly one file per platform', () => {
    const claimed = Object.values(PRODUCT);

    expect([...new Set(claimed)]).toHaveLength(TARGET_IDS.length);
  });
});

describe('TARGETS', () => {
  it('reaches every platform the page can name', () => {
    expect(Object.keys(TARGETS).sort()).toEqual([...TARGET_IDS].sort());
  });

  it('labels each download with the extension its own file carries', () => {
    for (const [asset, target] of Object.entries(PRODUCT)) {
      expect(asset.endsWith(TARGETS[target].ext), asset).toBe(true);
    }
  });
});
