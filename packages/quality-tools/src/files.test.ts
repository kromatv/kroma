import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readBounded } from './files';

const dir = mkdtempSync(join(tmpdir(), 'quality-files-'));
const file = join(dir, 'report.edn');
writeFileSync(file, '{:entries []}');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readBounded', () => {
  it('reads a file within the bound', () => {
    expect(readBounded(file, 13)).toBe('{:entries []}');
  });

  it('refuses a larger file without reading it', () => {
    expect(() => readBounded(file, 12)).toThrow(/13 bytes, more than the 12/);
  });

  it('throws for a file that is not there', () => {
    expect(() => readBounded(join(dir, 'missing.edn'), 64)).toThrow();
  });
});
