import { describe, expect, it } from 'vitest';
import { catalogsNamedIn, keysNamedIn } from './scan.ts';

const KEYS = new Map<string, string[]>([
  ['admin', ['admin.title', 'admin.count', 'admin.count_one']],
  ['pipeline', ['pipeline.t.loudness', 'pipeline.t.subtitles', 'pipeline.stats.title']],
  ['nav', ['nav.home']],
]);

describe('catalogsNamedIn', () => {
  it('names a namespace for a literal that is one of its keys, plural stems included', () => {
    expect(catalogsNamedIn("t('admin.title'); t('admin.count', { count })", KEYS)).toEqual([
      'admin',
    ]);
  });

  it('names a namespace for a template head that keys start with', () => {
    expect(catalogsNamedIn(`t(\`pipeline.t.\${stage}\`)`, KEYS)).toEqual(['pipeline']);
    expect(catalogsNamedIn("'pipeline.stats' + '.title'", KEYS)).toEqual(['pipeline']);
  });

  it('names nothing for a string that merely looks like a key', () => {
    const code = "emit('pipeline.progress'); import x from './nav.web'; 'see nav.home here'";

    expect(catalogsNamedIn(code, KEYS)).toEqual([]);
  });

  it('ignores a prefix that has no catalog', () => {
    expect(catalogsNamedIn("t('nope.x')", KEYS)).toEqual([]);
  });

  it('names only the file of a split namespace that holds the key', () => {
    const split = new Map([
      ['admin/users', ['admin.invite', 'admin.roleOwner']],
      ['admin/backup', ['admin.backupNow']],
    ]);

    expect(catalogsNamedIn("t('admin.invite')", split)).toEqual(['admin/users']);
    expect(catalogsNamedIn('t(`admin.${what}`)', split)).toEqual(['admin/backup', 'admin/users']);
  });
});

describe('keysNamedIn', () => {
  it('lists the keys a module writes out, and says when it builds one from a prefix', () => {
    const usage = keysNamedIn("t('admin.title'); t(`pipeline.t.${stage}`)", KEYS);

    expect(usage.get('admin')).toEqual({ keys: new Set(['admin.title']), whole: false });
    expect(usage.get('pipeline')).toEqual({ keys: new Set(), whole: true });
  });

  it('names nothing for a key written in a comment', () => {
    const code = [
      '/**',
      " * Wraps a row: `t('admin.title')`.",
      ' */',
      "// t('nav.home') used to live here",
      'export const row = 1;',
    ].join('\n');

    expect(keysNamedIn(code, KEYS).size).toBe(0);
  });

  it('still reads the key on a line that ends in a comment', () => {
    const usage = keysNamedIn("const label = t('nav.home'); // the way back", KEYS);

    expect([...usage.keys()]).toEqual(['nav']);
  });
});
