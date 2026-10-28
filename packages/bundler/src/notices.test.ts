import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { licenseTexts, type Notice, renderNotices } from './notices';

const notice = (name: string, texts: string[], license: string | null = 'MIT'): Notice => ({
  name,
  version: '1.0.0',
  license,
  source: `https://example.com/${name}`,
  texts,
});

describe('licenseTexts', () => {
  it('reads every license and notice file at the top of the folder, in name order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notices-'));
    writeFileSync(join(dir, 'LICENSE-MIT'), 'mit text\n');
    writeFileSync(join(dir, 'LICENSE-APACHE'), 'apache text');
    writeFileSync(join(dir, 'COPYING'), '');
    writeFileSync(join(dir, 'README.md'), 'not a license');
    mkdirSync(join(dir, 'licenses'));

    expect(licenseTexts(dir)).toEqual(['apache text', 'mit text']);
  });
});

describe('renderNotices', () => {
  it('lists every package, then each text once under the packages that ship it', () => {
    const out = renderNotices('Rust crates', [
      notice('serde', ['MIT text']),
      notice('anyhow', ['MIT text', 'Apache text'], 'MIT OR Apache-2.0'),
    ]);

    expect(out.split('\n').slice(0, 5)).toEqual([
      'Rust crates',
      '===========',
      '',
      '  anyhow 1.0.0  MIT OR Apache-2.0',
      '  serde 1.0.0  MIT',
    ]);
    expect(out.match(/MIT text/g)).toHaveLength(1);
    expect(out).toContain('  anyhow 1.0.0\n  serde 1.0.0\n\nMIT text');
    expect(out).toContain('  anyhow 1.0.0\n\nApache text');
  });

  it('points a package with no license file at its source', () => {
    const out = renderNotices('JavaScript packages', [notice('qrcode', [], null)]);

    expect(out).toContain('  qrcode 1.0.0  no license declared');
    expect(out).toContain(
      'Carrying no license file, so see their source:\n\n  qrcode 1.0.0  https://example.com/qrcode',
    );
  });
});
