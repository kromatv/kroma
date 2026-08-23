import { describe, expect, it } from 'vitest';
import { type Asset, canaryName, expired, familyOf, versionOf } from './canary';

const CANARY = '0.1.39-canary.3493975';

describe('canaryName', () => {
  it('dates the version in every installer the fleet produces', () => {
    expect(canaryName('out/KROMA-tizen-0.1.39.wgt', '0.1.39', CANARY)).toBe(
      `KROMA-tizen-${CANARY}.wgt`,
    );
    expect(canaryName('tv.kroma.webos_0.1.39_all.ipk', '0.1.39', CANARY)).toBe(
      `tv.kroma.webos_${CANARY}_all.ipk`,
    );
    expect(canaryName('KROMA_0.1.39_x64_en-US.msi', '0.1.39', CANARY)).toBe(
      `KROMA_${CANARY}_x64_en-US.msi`,
    );
    expect(canaryName('KROMA_0.1.39_amd64.AppImage', '0.1.39', CANARY)).toBe(
      `KROMA_${CANARY}_amd64.AppImage`,
    );
  });

  it('leaves a file alone when it carries another version or none', () => {
    expect(canaryName('kroma-0.1.39.3493975-x86_64.spk', '0.1.39', CANARY)).toBe(
      'kroma-0.1.39.3493975-x86_64.spk',
    );
    expect(canaryName('latest.json', '0.1.39', CANARY)).toBe('latest.json');
  });
});

describe('versionOf and familyOf', () => {
  it('reads the version off a name and blanks it for the family', () => {
    expect(versionOf(`KROMA_${CANARY}_aarch64.dmg`)).toBe(CANARY);
    expect(versionOf('kroma-0.1.38.3488516-x86_64.spk.info.json')).toBe('0.1.38.3488516');
    expect(familyOf('kroma-0.1.38.3488516-x86_64.spk')).toBe('kroma-*-x86_64.spk');
    expect(familyOf('latest.json')).toBe('latest.json');
  });
});

describe('expired', () => {
  const now = new Date('2026-08-23T00:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const spk = (build: number, age: number): Asset => ({
    name: `kroma-0.1.39.${build}-x86_64.spk`,
    createdAt: daysAgo(age),
  });

  it('keeps the newest few of a family no matter how old', () => {
    const assets = [spk(1, 40), spk(2, 30), spk(3, 20)];

    expect(expired(assets, now, { keepDays: 14, keepMin: 3 })).toEqual([]);
  });

  it('retires what is past the newest few and older than the window', () => {
    const assets = [spk(1, 40), spk(2, 30), spk(3, 10), spk(4, 1)];

    expect(expired(assets, now, { keepDays: 14, keepMin: 2 }).map((a) => a.name)).toEqual([
      'kroma-0.1.39.2-x86_64.spk',
      'kroma-0.1.39.1-x86_64.spk',
    ]);
  });

  it('judges each family on its own', () => {
    const assets = [
      spk(1, 40),
      { name: `KROMA-tizen-0.1.39-canary.1.wgt`, createdAt: daysAgo(40) },
      { name: `KROMA-tizen-0.1.39-canary.2.wgt`, createdAt: daysAgo(1) },
    ];

    expect(expired(assets, now, { keepDays: 14, keepMin: 1 }).map((a) => a.name)).toEqual([
      'KROMA-tizen-0.1.39-canary.1.wgt',
    ]);
  });
});
