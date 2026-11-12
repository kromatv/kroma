import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { extractZip, packZip } from './zip';

const base = mkdtempSync(join(tmpdir(), 'kroma-zip-'));
const text = (value: string) => new TextEncoder().encode(value);

function archive(name: string, entries: Record<string, Uint8Array>): string {
  const path = join(base, name);
  writeFileSync(path, zipSync(entries));
  return path;
}

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('extractZip', () => {
  it('writes every file where its entry says, folders made on the way', async () => {
    const zip = archive('widget.zip', {
      'config.xml': text('<widget />'),
      'assets/app.js': text('start()'),
    });
    const out = join(base, 'widget');

    await extractZip(zip, out);

    expect(readFileSync(join(out, 'config.xml'), 'utf8')).toBe('<widget />');
    expect(readFileSync(join(out, 'assets/app.js'), 'utf8')).toBe('start()');
  });

  it('makes a folder the archive lists with nothing in it', async () => {
    const zip = archive('empty-folder.zip', { 'locales/': new Uint8Array() });
    const out = join(base, 'empty-folder');

    await extractZip(zip, out);

    expect(statSync(join(out, 'locales')).isDirectory()).toBe(true);
  });

  it('refuses an entry that climbs out of the folder', async () => {
    const zip = archive('escape.zip', { '../escaped.txt': text('out') });

    await expect(extractZip(zip, join(base, 'escape'))).rejects.toThrow(
      'holds ../escaped.txt, which would land outside',
    );
  });
});

describe('packZip', () => {
  it('packs every file under its path from the folder, with forward slashes', async () => {
    const folder = join(base, 'app');
    mkdirSync(join(folder, 'assets/fonts'), { recursive: true });
    writeFileSync(join(folder, 'config.xml'), '<widget />');
    writeFileSync(join(folder, 'assets/fonts/ui.woff2'), 'font');
    const out = join(base, 'app.wgt');

    await packZip(folder, out);

    const packed = unzipSync(readFileSync(out));
    expect(Object.keys(packed)).toEqual(['assets/fonts/ui.woff2', 'config.xml']);
    expect(new TextDecoder().decode(packed['config.xml'])).toBe('<widget />');
  });

  it('survives a round trip through its own archive', async () => {
    const folder = join(base, 'round');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'index.html'), '<html></html>');
    const zip = join(base, 'round.zip');
    const again = join(base, 'round-again');

    await packZip(folder, zip);
    await extractZip(zip, again);

    expect(readFileSync(join(again, 'index.html'), 'utf8')).toBe('<html></html>');
  });
});
