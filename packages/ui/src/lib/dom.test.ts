// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setDocumentLanguage, webDocument, webWindow } from './dom';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

describe('webDocument', () => {
  it('is the document in a browser, and null where there is none', () => {
    expect(webDocument()).toBe(document);
    vi.stubGlobal('document', undefined);
    expect(webDocument()).toBeNull();
  });
});

describe('webWindow', () => {
  it('is the window in a browser', () => {
    expect(webWindow()).toBe(window);
  });

  it('is null where `window` exists but carries no DOM event API', () => {
    vi.stubGlobal('window', { document: {} });
    expect(webWindow()).toBeNull();
  });

  it('is null where there is no window at all', () => {
    vi.stubGlobal('window', undefined);
    expect(webWindow()).toBeNull();
  });
});

describe('setDocumentLanguage', () => {
  it('marks <html> with the language and the way it is written', () => {
    setDocumentLanguage('ar');

    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['ar', 'rtl']);
  });

  it('turns the page back left to right for a language written that way', () => {
    document.documentElement.dir = 'rtl';

    setDocumentLanguage('fr');

    expect(document.documentElement.dir).toBe('ltr');
  });

  it('does nothing where there is no document', () => {
    vi.stubGlobal('document', undefined);

    expect(() => setDocumentLanguage('ar')).not.toThrow();
  });
});
