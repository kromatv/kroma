import { beforeEach, describe, expect, it } from 'vitest';
import { setEngine } from '../engine/engine';
import { testEngine } from '../testing';
import { forgetMarks, gradeOf, mark, markIn, sightingIn, stripMarks } from './mark';

const FR = { scope: null, locale: 'fr' };
const EN = { scope: null, locale: 'en' };

function rendered(text: string, over: Partial<Parameters<typeof gradeOf>[0]> = {}) {
  const holes = [...text.matchAll(/\{(\w+)}/g)].map(([, name]) => name as string);
  return { key: 'auth.login', from: FR, locale: 'fr', text, vars: undefined, holes, ...over };
}

beforeEach(() => {
  setEngine(testEngine());
});

describe('grading a message', () => {
  it('calls the catalog for the locale asked for the clean answer', () => {
    expect(gradeOf(rendered('Connexion'))).toBe('catalog');
  });

  it('calls another locale answering a fallback', () => {
    expect(gradeOf(rendered('Sign in', { from: EN }))).toBe('fallback');
  });

  it('calls nothing answering missing', () => {
    expect(gradeOf(rendered('auth.login', { from: undefined }))).toBe('missing');
  });

  it('calls a placeholder left standing a variable that was never given', () => {
    expect(gradeOf(rendered('Bonjour {name}'))).toBe('vars');
  });
});

describe('the mark a message carries', () => {
  it('adds nothing a reader can see', () => {
    const marked = mark(rendered('Connexion'), 'Connexion');

    expect(stripMarks(marked)).toBe('Connexion');
  });

  it('reads its grade back off the text it stamped', () => {
    expect(markIn(mark(rendered('Sign in', { from: EN }), 'Sign in'))).toBe('fallback');
  });

  it('reports nothing for a string that never went through a catalog', () => {
    expect(markIn('Blade Runner 2049')).toBeNull();
  });

  it('reports the worst of several messages sharing one text node', () => {
    const text = [
      mark(rendered('a'), 'a'),
      mark(rendered('b', { from: undefined }), 'b'),
      mark(rendered('c', { from: EN }), 'c'),
    ].join(' ');

    expect(markIn(text)).toBe('missing');
  });
});

describe('the worst mark in a run of text', () => {
  it('keeps the worse of two, whichever order they were drawn in', () => {
    const clean = mark(rendered('Connexion'), 'Connexion');
    const fallback = mark(rendered('Sign in', { from: EN }), 'Sign in');

    expect([markIn(clean + fallback), markIn(fallback + clean)]).toEqual(['fallback', 'fallback']);
  });

  it('stops at a key nothing answered, there being nothing worse', () => {
    const clean = mark(rendered('Connexion'), 'Connexion');
    const missing = mark(rendered('auth.login', { from: undefined }), 'auth.login');

    expect(markIn(clean + missing)).toBe('missing');
  });
});

describe('remembering what drew a string', () => {
  it('names the key, the catalog and the variables behind the text', () => {
    const marked = mark(rendered('Bonjour Maxime', { vars: { name: 'Maxime' } }), 'Bonjour Maxime');

    expect(sightingIn(marked)).toMatchObject({
      key: 'auth.login',
      scope: null,
      locale: 'fr',
      grade: 'catalog',
      vars: { name: 'Maxime' },
      holes: [],
    });
  });

  it('keeps the placeholders that were given no value', () => {
    const marked = mark(rendered('Bonjour {name}'), 'Bonjour {name}');

    expect(sightingIn(marked)).toMatchObject({ grade: 'vars', holes: ['name'] });
  });

  it('knows nothing of a string it never stamped', () => {
    expect(sightingIn('Blade Runner 2049')).toBeNull();
  });
});

describe('forgetting what was drawn', () => {
  it('lets go of every message once the overlay is down', () => {
    const marked = mark(rendered('Connexion'), 'Connexion');

    forgetMarks();

    expect(sightingIn(marked)).toBeNull();
  });

  it('keeps the worst of two marks in one string', () => {
    const mild = mark(rendered('a', { from: EN }), 'a');
    const worse = mark(rendered('b', { from: undefined }), 'b');

    expect(markIn(`${worse} ${mild}`)).toBe('missing');
    expect(markIn(`${mild} ${worse}`)).toBe('missing');
  });

  it('names the message a fragment of it started, where the page split one', () => {
    const drawn = mark(rendered('Your media library, at home.'), 'Your media library, at home.');
    const [half] = drawn.split(' at home.');

    expect(sightingIn(half ?? '')?.key).toBe('auth.login');
  });

  it('names nothing for a fragment that started no message', () => {
    mark(rendered('Your media library, at home.'), 'Your media library, at home.');

    expect(sightingIn('Blade Runner')).toBeNull();
  });

  it('names nothing for whitespace, which starts everything and means nothing', () => {
    mark(rendered('Connexion'), 'Connexion');

    expect(sightingIn('   ')).toBeNull();
  });
});
