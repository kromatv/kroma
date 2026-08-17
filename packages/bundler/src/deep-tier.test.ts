import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenCustomProperties, lowerJs, syntaxAboveDeepFloor } from './deep-tier';

function sheet(css: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'kroma-deep-')), 'style.css');
  writeFileSync(path, css);
  return path;
}

function script(js: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'kroma-deep-')), 'index.js');
  writeFileSync(path, js);
  return path;
}

describe('syntaxAboveDeepFloor', () => {
  it('passes the ES5 and M47-era syntax Babel leaves alone', () => {
    // A template literal and for-of are M41 and M38: Babel leaves both alone,
    // and the walk must not mistake them for something a 2017 set cannot parse.
    const code = 'var a = function (x) { return `plain`; };for (var k of []) a(k);';
    expect(syntaxAboveDeepFloor(code)).toEqual([]);
  });

  it.each([
    ['let x = 1;', 'let declaration'],
    ['const x = 1;', 'const declaration'],
    ['var C = class {};', 'class'],
    ['var { a } = b;', 'destructuring'],
    ['function f(a = 1) {}', 'default parameter'],
  ])('flags %j', (code, expected) => {
    expect(syntaxAboveDeepFloor(code)).toContain(expected);
  });

  it('does not flag generated code sitting in a string literal', () => {
    const code = 'var w = "const input = payload.value;";var y = "class Foo {}";';
    expect(syntaxAboveDeepFloor(code)).toEqual([]);
  });
});

describe('lowerJs', () => {
  // The bundle is a sloppy-mode IIFE, so the round trip is the assertion that
  // matters: whatever Babel leaves behind has to satisfy the same walk that
  // guards the build.
  const BUNDLE = `(function () {
    class Player { constructor(a = 1) { this.a = a; } }
    let { x, y } = { x: 1, y: 2 };
    const parts = [...[x, y]];
    for (const p of parts) new Player(p);
    function* steps() { yield 1; }
    steps();
  })();`;

  it('leaves nothing above the floor', async () => {
    expect(syntaxAboveDeepFloor(BUNDLE).length).toBeGreaterThan(0);
    const path = script(BUNDLE);
    await lowerJs(path, 47);
    expect(syntaxAboveDeepFloor(readFileSync(path, 'utf8'))).toEqual([]);
  });

  it('keeps the file executable, and its behaviour', async () => {
    const path = script(`${BUNDLE}\nglobalThis.__deepResult = [1, 2].map((n) => n * 2).join();`);
    await lowerJs(path, 47);
    const lowered = readFileSync(path, 'utf8');
    new Function(lowered)();
    expect((globalThis as { __deepResult?: string }).__deepResult).toBe('2,4');
  });

  it('refuses a file it cannot parse, rather than emitting it unchanged', async () => {
    await expect(lowerJs(script('function ('), 47)).rejects.toThrow();
  });
});

describe('flattenCustomProperties', () => {
  // Each of these is one input reduced to the literal a 2017 set can read.
  it.each([
    ['resolves against the pinned theme', ':root,[data-theme=dark]{--bg:#000}.a{color:var(--bg)}'],
    [
      'unwraps a prefers-color-scheme block for the pinned theme',
      ':root{--bg:#000}@media (prefers-color-scheme:light){:root{--bg:#fff}}.a{color:var(--bg)}',
    ],
    [
      'keeps a descendant selector scoped to the pinned theme',
      ':root{--bg:#000}[data-theme=dark] .a{color:var(--bg)}',
    ],
  ])('%s', async (_name, css) => {
    const path = sheet(css);
    await flattenCustomProperties(path, 'dark');
    expect(readFileSync(path, 'utf8')).toBe('.a{color:#000}');
  });

  it('drops the themes it is not shipping', async () => {
    const path = sheet(
      ':root,[data-theme=dark]{--bg:#000}[data-theme=light]{--bg:#fff}.a{color:var(--bg)}',
    );
    await flattenCustomProperties(path, 'dark');
    const css = readFileSync(path, 'utf8');
    expect(css).toContain('#000');
    expect(css).not.toContain('#fff');
  });

  it('resolves a property defined through another property', async () => {
    const path = sheet(':root{--ink:#0a0a0c;--text:var(--ink)}.a{color:var(--text)}');
    await flattenCustomProperties(path, 'dark');
    expect(readFileSync(path, 'utf8')).toBe('.a{color:#0a0a0c}');
  });

  it('throws rather than emit a sheet an engine below M49 would drop', async () => {
    const path = sheet('.a{color:var(--never-defined)}');
    await expect(flattenCustomProperties(path, 'dark')).rejects.toThrow('--never-defined');
  });
});
