import { describe, expect, it } from 'vitest';
import { byFile, outsideRustTests, parseFunctions } from './functions';

const RUST =
  '{"file": "server/src/a.rs", "name": "walk", "namespace": "kroma::a", "start": 3, "end": 9, "lines": 6, "complexity": 2, "coverage": 50.0, "crap": 2.5, "parameters": 1, "nesting": 1}';
const SCRIPT =
  '{"file": "packages/core/src/b.ts", "name": "read", "namespace": "b", "start": 1, "end": 4, "lines": 4, "complexity": 1, "coverage": null, "crap": null}';

const rustAt = (name: string, start: number) =>
  RUST.replace('"walk"', `"${name}"`).replace(
    '"start": 3, "end": 9',
    `"start": ${start}, "end": ${start + 1}`,
  );

describe('parseFunctions', () => {
  it('reads one function per line, with the shape only Rust carries', () => {
    const [rust, script] = parseFunctions(`${RUST}\n${SCRIPT}\n`);

    expect(rust).toMatchObject({ name: 'walk', start: 3, end: 9, crap: 2.5, parameters: 1 });
    expect(script).toMatchObject({ name: 'read', crap: null });
    expect(script?.parameters).toBeUndefined();
  });

  it('refuses a line that is not a function', () => {
    expect(() => parseFunctions('{"file": "a.rs"}')).toThrow();
  });
});

describe('byFile', () => {
  it('groups functions under the file that holds them', () => {
    const grouped = byFile(parseFunctions(`${RUST}\n${RUST}\n${SCRIPT}`));

    expect(grouped.get('server/src/a.rs')).toHaveLength(2);
    expect(grouped.get('packages/core/src/b.ts')).toHaveLength(1);
  });
});

describe('outsideRustTests', () => {
  it('drops a Rust function inside a test-only item, and reads no TypeScript file', () => {
    const source = [
      '',
      '',
      'fn walk() {',
      '}',
      '',
      '#[cfg(test)]',
      'mod checks {',
      '    fn helper() {',
      '    }',
      '}',
    ].join('\n');
    const functions = parseFunctions([rustAt('walk', 3), rustAt('helper', 8), SCRIPT].join('\n'));
    const read = (file: string) => (file.endsWith('.rs') ? source : 'unreadable #[cfg(test)]');

    const kept = outsideRustTests(functions, read);

    expect(kept.map((scored) => scored.name)).toEqual(['walk', 'read']);
  });
});
