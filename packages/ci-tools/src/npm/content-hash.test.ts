import { describe, expect, it } from 'vitest';
import { contentHash, decide, normalisePackageJson, type PackageFiles } from './content-hash';

const enc = new TextEncoder();

function pkg(version: string, extra: Record<string, unknown> = {}, js = 'a'): PackageFiles {
  return new Map([
    ['package.json', enc.encode(JSON.stringify({ name: 'x', version, ...extra }))],
    ['index.js', enc.encode(js)],
    ['Cargo.toml', enc.encode(`version = "${version}"`)],
  ]);
}

describe('normalisePackageJson', () => {
  it('drops the version and sorts keys at every depth', () => {
    const out = normalisePackageJson(
      enc.encode('{"b":{"z":1,"a":[{"d":1,"c":2}]},"version":"1","a":null}'),
    );

    expect(new TextDecoder().decode(out)).toBe('{"a":null,"b":{"a":[{"c":2,"d":1}],"z":1}}');
  });

  it('rejects a package.json that is not an object', () => {
    expect(() => normalisePackageJson(enc.encode('[]'))).toThrow(/not an object/);
    expect(() => normalisePackageJson(enc.encode('3'))).toThrow(/not an object/);
  });
});

describe('contentHash', () => {
  it('ignores the version and the order of files', () => {
    const reordered = new Map([...pkg('2.0.0')].reverse());

    expect(contentHash(reordered)).toBe(contentHash(pkg('1.0.0')));
  });

  it('moves when a file changes', () => {
    expect(contentHash(pkg('1', {}, 'b'))).not.toBe(contentHash(pkg('1')));
  });

  it('moves when package.json changes beyond its version', () => {
    expect(contentHash(pkg('1', { dependencies: { y: '1' } }))).not.toBe(contentHash(pkg('1')));
  });

  it('hashes alike a package without a version', () => {
    const bare = new Map([['package.json', enc.encode('{"name":"x"}')]]);

    expect(contentHash(bare)).toBe(contentHash(new Map(bare)));
  });

  it('tells a moved byte from a moved path', () => {
    const a = new Map([['ab', enc.encode('c')]]);
    const b = new Map([['a', enc.encode('bc')]]);

    expect(contentHash(a)).not.toBe(contentHash(b));
  });
});

describe('decide', () => {
  it('always publishes a tag other than canary', () => {
    expect(decide({ tag: 'latest', local: pkg('1'), published: pkg('1') }).publish).toBe(true);
  });

  it('publishes a first canary', () => {
    const verdict = decide({ tag: 'canary', local: pkg('1'), published: null });

    expect(verdict).toEqual({ publish: true, reason: 'no canary is published yet' });
  });

  it('skips a canary whose content is unchanged', () => {
    const verdict = decide({ tag: 'canary', local: pkg('2'), published: pkg('1') });

    expect(verdict.publish).toBe(false);
    expect(verdict.reason).toMatch(/^unchanged, skip/);
  });

  it('publishes a canary whose content changed', () => {
    const verdict = decide({ tag: 'canary', local: pkg('2', {}, 'b'), published: pkg('1') });

    expect(verdict.publish).toBe(true);
    expect(verdict.reason).toMatch(/^changed/);
  });
});
