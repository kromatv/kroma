import { describe, expect, it } from 'vitest';
import { compile, matchesAny } from './glob';

describe('compile', () => {
  it('lets ** span directories and * stop at a slash', () => {
    expect(compile('server/**').test('server/crates/kroma-db/src/lib.rs')).toBe(true);
    expect(compile('modules/*/ui/**').test('modules/tv.kroma.vpn/ui/src/index.tsx')).toBe(true);
    expect(compile('modules/*/ui/**').test('modules/tv.kroma.vpn/server/src/lib.rs')).toBe(false);
    expect(compile('*.md').test('docs/readme.md')).toBe(false);
  });

  it('matches a file at the root through a leading **/', () => {
    expect(compile('**/*.md').test('README.md')).toBe(true);
    expect(compile('**/*.md').test('docs/spec/index.md')).toBe(true);
    expect(compile('**').test('LICENSE')).toBe(true);
  });

  it('expands a brace into alternatives', () => {
    const re = compile('packages/{core,ui}/**');

    expect(re.test('packages/core/src/hevc.ts')).toBe(true);
    expect(re.test('packages/ui/src/x.tsx')).toBe(true);
    expect(re.test('packages/tv/src/x.tsx')).toBe(false);
  });

  it('treats a dot as a literal', () => {
    expect(compile('bun.lock').test('bunxlock')).toBe(false);
    expect(compile('.bun-version').test('.bun-version')).toBe(true);
  });

  it('rejects an unclosed brace', () => {
    expect(() => compile('a/{b,c')).toThrow(/unclosed brace/);
  });
});

describe('matchesAny', () => {
  it('is true when any glob matches', () => {
    expect(matchesAny('clients/web/src/app.tsx', ['server/**', 'clients/**'])).toBe(true);
    expect(matchesAny('clients/web/src/app.tsx', ['server/**'])).toBe(false);
  });
});
