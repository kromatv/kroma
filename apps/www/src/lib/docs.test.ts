import { describe, expect, it } from 'vitest';
import { createDocs, type DocModule, docPath, isDocSlug, repoPathOf } from './docs';

const Body = (() => null) as unknown as DocModule['default'];

const mod = (title?: string, description?: string): DocModule => ({
  default: Body,
  title,
  description,
});

const base = 'apps/www/src/lib';
const english = '../../../../docs/setup';
const french = '../../content/docs';

describe('createDocs', () => {
  it('serves the README of docs/setup as the index', () => {
    const docs = createDocs({ [`${english}/README.md`]: mod('Set up KROMA') }, base);

    const doc = docs.getDoc('index', 'en');

    expect(doc?.title).toBe('Set up KROMA');
    expect(doc?.path).toBe('/docs');
    expect(doc?.section).toBe('start');
  });

  it('serves the translation when one exists', () => {
    const docs = createDocs(
      {
        [`${english}/docker.md`]: mod('Install KROMA with Docker', 'English summary'),
        [`${french}/docker.fr.md`]: mod('Installer KROMA avec Docker', 'Résumé'),
      },
      base,
    );

    const doc = docs.getDoc('docker', 'fr');

    expect(doc?.title).toBe('Installer KROMA avec Docker');
    expect(doc?.description).toBe('Résumé');
    expect(doc?.translated).toBe(true);
    expect(doc?.source).toBe('apps/www/content/docs/docker.fr.md');
  });

  it('falls back to English and says so', () => {
    const docs = createDocs({ [`${english}/lg-tv.md`]: mod('Install KROMA on an LG TV') }, base);

    const doc = docs.getDoc('lg-tv', 'fr');

    expect(doc?.title).toBe('Install KROMA on an LG TV');
    expect(doc?.translated).toBe(false);
    expect(doc?.source).toBe('docs/setup/lg-tv.md');
  });

  it('names a guide by its slug when it has no title', () => {
    const docs = createDocs({ [`${english}/tv.md`]: mod() }, base);

    expect(docs.getDoc('tv', 'en')?.title).toBe('tv');
    expect(docs.getDoc('tv', 'en')?.description).toBe('');
  });

  it('knows nothing of a file that is not in the reading order', () => {
    const docs = createDocs({ [`${english}/draft-notes.md`]: mod('Draft') }, base);

    expect(docs.getDoc('draft-notes', 'en')).toBeUndefined();
    expect(docs.listed()).toEqual([]);
  });

  it('lists the guides in reading order, whatever order the files came in', () => {
    const docs = createDocs(
      {
        [`${english}/troubleshooting.md`]: mod(),
        [`${english}/README.md`]: mod(),
        [`${english}/docker.md`]: mod(),
      },
      base,
    );

    expect(docs.listed()).toEqual(['index', 'docker', 'troubleshooting']);
  });

  it('links each guide to the ones present before and after it', () => {
    const docs = createDocs(
      {
        [`${english}/README.md`]: mod(),
        [`${english}/docker.md`]: mod(),
        [`${english}/troubleshooting.md`]: mod(),
      },
      base,
    );

    expect(docs.neighbours('index')).toEqual({ prev: undefined, next: 'docker' });
    expect(docs.neighbours('docker')).toEqual({ prev: 'index', next: 'troubleshooting' });
    expect(docs.neighbours('synology')).toEqual({});
  });
});

describe('docPath', () => {
  it('puts the index at /docs and every other guide below it', () => {
    expect(docPath('index')).toBe('/docs');
    expect(docPath('samsung-tv')).toBe('/docs/samsung-tv');
  });
});

describe('isDocSlug', () => {
  it('accepts the guides of the reading order only', () => {
    expect(isDocSlug('docker')).toBe(true);
    expect(isDocSlug('README')).toBe(false);
  });
});

describe('repoPathOf', () => {
  it('resolves a glob key from the folder that globbed it', () => {
    expect(repoPathOf('../../../../docs/setup/docker.md', base)).toBe('docs/setup/docker.md');
    expect(repoPathOf('./docs.ts', base)).toBe('apps/www/src/lib/docs.ts');
  });
});
