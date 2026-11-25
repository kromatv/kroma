import type { LicenseEntry, Licenses } from '@kromatv/client/licenses';
import { describe, expect, it } from 'vitest';
import { matchingPackages, type ShippedPackage, shippedPackages } from './licenses';

const entry = (name: string, more: Partial<LicenseEntry> = {}): LicenseEntry => ({
  kind: 'npm',
  name,
  version: '1.0.0',
  license: 'MIT',
  source: null,
  texts: [],
  ...more,
});

const manifest = (entries: LicenseEntry[], texts: string[] = []): Licenses => ({ texts, entries });

describe('shippedPackages', () => {
  it('lists a package two builds ship once, under both', () => {
    const builds = [
      { surface: 'server' as const, licenses: manifest([entry('serde', { kind: 'crate' })]) },
      {
        surface: 'web' as const,
        licenses: manifest([entry('react'), entry('serde', { kind: 'crate' })]),
      },
    ];

    const packages = shippedPackages(builds);

    expect(packages.map((one) => [one.name, one.surfaces])).toEqual([
      ['react', ['web']],
      ['serde', ['server', 'web']],
    ]);
  });

  it('keeps two versions of one package apart', () => {
    const builds = [
      {
        surface: 'server' as const,
        licenses: manifest([
          entry('syn', { version: '1.0.0' }),
          entry('syn', { version: '2.0.0' }),
        ]),
      },
    ];

    const packages = shippedPackages(builds);

    expect(packages.map((one) => one.key)).toEqual(['npm:syn@1.0.0', 'npm:syn@2.0.0']);
  });

  it('reads each package its own texts out of the build it came from', () => {
    const builds = [
      {
        surface: 'server' as const,
        licenses: manifest([entry('a', { texts: [1, 0] })], ['A', 'B']),
      },
      { surface: 'web' as const, licenses: manifest([entry('b', { texts: [0, 7] })], ['C']) },
    ];

    const packages = shippedPackages(builds);

    expect(packages.map((one) => one.texts)).toEqual([['B', 'A'], ['C']]);
  });

  it('links only a web address', () => {
    const builds = [
      {
        surface: 'web' as const,
        licenses: manifest([
          entry('a', { source: 'https://github.com/a/a' }),
          entry('b', { source: 'javascript:alert(1)' }),
        ]),
      },
    ];

    const packages = shippedPackages(builds);

    expect(packages.map((one) => one.source)).toEqual(['https://github.com/a/a', null]);
  });
});

describe('matchingPackages', () => {
  const packages: ShippedPackage[] = shippedPackages([
    {
      surface: 'web',
      licenses: manifest([
        entry('react', { version: '19.2.0' }),
        entry('zod', { license: 'Apache-2.0' }),
        entry('tokio', { license: null, version: null }),
      ]),
    },
  ]);

  it('finds a package by its name, its version or its license, whatever the case', () => {
    expect(matchingPackages(packages, ' REACT ').map((one) => one.name)).toEqual(['react']);
    expect(matchingPackages(packages, '19.2').map((one) => one.name)).toEqual(['react']);
    expect(matchingPackages(packages, 'apache').map((one) => one.name)).toEqual(['zod']);
  });

  it('matches every package for a blank query', () => {
    expect(matchingPackages(packages, '  ')).toBe(packages);
  });
});
