import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { main, reportsAt } from './lcov-command';

const report = (file: string) => `SF:${file}\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`;

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'lcov-'));
}

function part(root: string, name: string, file: string): void {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, 'lcov.info'), report(file));
}

it('takes a report by its own path', () => {
  const root = folder();
  writeFileSync(join(root, 'one.info'), report('a.rs'));

  expect(reportsAt(join(root, 'one.info'))).toEqual([join(root, 'one.info')]);
});

it('finds the one report a single part leaves at the top of the folder', () => {
  const root = folder();
  writeFileSync(join(root, 'lcov.info'), report('a.rs'));

  expect(reportsAt(root)).toEqual([join(root, 'lcov.info')]);
});

it('finds a report in each folder several parts leave', () => {
  const root = folder();
  part(root, 'coverage-rust-0', 'a.rs');
  part(root, 'coverage-rust-1', 'b.rs');

  expect(reportsAt(root)).toEqual([
    join(root, 'coverage-rust-0', 'lcov.info'),
    join(root, 'coverage-rust-1', 'lcov.info'),
  ]);
});

it('merges every report of a folder into one', () => {
  const root = folder();
  part(root, 'coverage-rust-0', 'a.rs');
  part(root, 'coverage-rust-1', 'b.rs');
  const out = join(root, 'merged.info');

  main(['merge', out, root]);

  const merged = readFileSync(out, 'utf8');
  expect(merged).toContain('SF:a.rs');
  expect(merged).toContain('SF:b.rs');
});

it('refuses a folder that holds no report', () => {
  const root = folder();

  expect(() => main(['merge', join(root, 'merged.info'), root])).toThrow('usage');
});
