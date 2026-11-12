import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { writeWidget } from './widget.fixture';
import { widgetResources } from './widget-resources';

const directory = writeWidget({
  'config.xml': '',
  'index.html': '',
  '.manifest.tmp': '',
  '.delta.lst': '',
  'author-signature.xml': '',
  'signature1.xml': '',
  'signature12.xml': '',
  'legacy!.txt': '',
  'legacy.txt': '',
  'legacy/index.js': '',
  'legacy~.txt': '',
  'assets/app main.js': '',
  'accentué.txt': '',
});

const paths = (role: 'author' | 'distributor') =>
  widgetResources(directory, role).map((resource) => resource.path);

const uriOf = (path: string) =>
  widgetResources(directory, 'author').find((resource) => resource.path === path)?.uri;

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('widgetResources', () => {
  it('orders by the path a slash still separates, not by the escaped form', () => {
    expect(paths('author').filter((path) => path.startsWith('legacy'))).toEqual([
      'legacy!.txt',
      'legacy.txt',
      'legacy/index.js',
      'legacy~.txt',
    ]);
  });

  it('escapes the separator and the space Tizen calls unsafe, in upper case', () => {
    expect(uriOf('assets/app main.js')).toBe('assets%2Fapp%20main.js');
    expect(uriOf('legacy~.txt')).toBe('legacy%7E.txt');
  });

  it('escapes a name outside ASCII as UTF-8', () => {
    expect(uriOf('accentué.txt')).toBe('accentu%C3%A9.txt');
  });

  it('leaves out the packaging leftovers and every distributor signature', () => {
    expect(paths('distributor')).not.toContain('.manifest.tmp');
    expect(paths('distributor')).not.toContain('.delta.lst');
    expect(paths('distributor')).not.toContain('signature1.xml');
    expect(paths('distributor')).not.toContain('signature12.xml');
  });

  it('covers the author signature from the distributor and never from the author', () => {
    expect(paths('author')).not.toContain('author-signature.xml');
    expect(paths('distributor')).toContain('author-signature.xml');
  });
});
