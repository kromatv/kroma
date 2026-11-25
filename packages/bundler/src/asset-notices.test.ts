import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetNotices, SIDECAR } from './asset-notices';

function fonts(): string {
  const dir = mkdtempSync(join(tmpdir(), 'assets-'));
  writeFileSync(join(dir, 'OFL-hanken.txt'), 'Copyright 2021 Hanken\n\nOFL text\n');
  writeFileSync(join(dir, 'OFL-bricolage.txt'), 'Copyright 2022 Bricolage');
  writeFileSync(
    join(dir, SIDECAR),
    JSON.stringify([
      {
        name: 'Hanken Grotesk',
        version: '3.013',
        license: 'OFL-1.1',
        source: 'https://github.com/marcologous/hanken-grotesk',
        files: ['hanken-latin.woff2', 'hanken-latin-ext.woff2'],
        notice: 'OFL-hanken.txt',
      },
      {
        name: 'Bricolage Grotesque',
        version: '1.001',
        license: 'OFL-1.1',
        source: 'https://github.com/ateliertriay/bricolage',
        files: ['bricolage-latin.woff2'],
        notice: 'OFL-bricolage.txt',
      },
    ]),
  );
  return dir;
}

describe('assetNotices', () => {
  it('names each work the emitted files belong to once, with its notice', () => {
    const dir = fonts();

    const notices = assetNotices([
      join(dir, 'hanken-latin.woff2'),
      join(dir, 'hanken-latin-ext.woff2'),
      '/repo/packages/ui/src/assets/logo.svg',
    ]);

    expect(notices).toEqual([
      {
        name: 'Hanken Grotesk',
        version: '3.013',
        license: 'OFL-1.1',
        source: 'https://github.com/marcologous/hanken-grotesk',
        texts: ['Copyright 2021 Hanken\n\nOFL text'],
      },
    ]);
  });

  it('refuses a third-party.json that leaves a field out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'assets-'));
    writeFileSync(join(dir, SIDECAR), JSON.stringify([{ name: 'Font', files: ['a.woff2'] }]));

    expect(() => assetNotices([join(dir, 'a.woff2')])).toThrow();
  });
});
