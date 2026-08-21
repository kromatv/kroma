// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readMode, THEME_BOOTSTRAP, THEME_MODES, writeMode } from './theme.ts';

beforeEach(() => {
  // biome-ignore lint/suspicious/noDocumentCookie: same reason as theme.ts, and this is the API under test
  document.cookie = 'kroma-theme=;path=/;max-age=0';
  delete document.documentElement.dataset.theme;
});

describe('readMode', () => {
  it('answers system for a visitor who never chose', () => {
    expect(readMode()).toBe('system');
  });

  it('reads a stored choice back', () => {
    for (const mode of THEME_MODES) {
      writeMode(mode);
      expect(readMode()).toBe(mode);
    }
  });

  it('falls back to system rather than trusting a cookie it did not write', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: same reason as theme.ts, and this is the API under test
    document.cookie = 'kroma-theme=sepia;path=/';

    expect(readMode()).toBe('system');
  });
});

describe('writeMode', () => {
  it('stamps the document so the choice applies before any paint', () => {
    writeMode('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    writeMode('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('stores system as the ABSENCE of the attribute, which leaves the OS in charge', () => {
    writeMode('dark');
    writeMode('system');

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readMode()).toBe('system');
  });
});

describe('THEME_BOOTSTRAP', () => {
  it('stamps the stored ground when it runs before the first paint', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: same reason as theme.ts, and this is the API under test
    document.cookie = 'kroma-theme=light;path=/';

    new Function(THEME_BOOTSTRAP)();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('leaves the document alone for a visitor who chose system', () => {
    new Function(THEME_BOOTSTRAP)();

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
