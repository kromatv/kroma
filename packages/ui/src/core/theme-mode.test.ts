// @vitest-environment jsdom
import { Appearance } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { themeVersion } from './theme';
import {
  applyMode,
  isThemeMode,
  readMode,
  resolveMode,
  THEME_COOKIE,
  writeMode,
} from './theme-mode';

afterEach(() => {
  writeMode('system');
  vi.restoreAllMocks();
});

describe('isThemeMode', () => {
  it('accepts the three grounds and refuses everything else', () => {
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('ocean')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(isThemeMode(0)).toBe(false);
  });
});

describe('readMode', () => {
  it('picks the choice out of a jar it is handed, wherever it sits', () => {
    expect(readMode(`${THEME_COOKIE}=light`)).toBe('light');
    expect(readMode(`a=1; ${THEME_COOKIE}=dark; b=2`)).toBe('dark');
  });

  it('will not answer to a cookie whose name merely ends in ours', () => {
    expect(readMode(`x-${THEME_COOKIE}=light`)).toBe('system');
  });

  it('reads a value it does not know, and an empty jar, as system', () => {
    expect(readMode(`${THEME_COOKIE}=ocean`)).toBe('system');
    expect(readMode('')).toBe('system');
  });
});

describe('writeMode', () => {
  it('leaves the choice where the server will find it on the next request', () => {
    writeMode('dark');
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
    expect(readMode()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('stores system too, so a browser default is never mistaken for a choice', () => {
    writeMode('light');
    writeMode('system');
    expect(document.cookie).toContain(`${THEME_COOKIE}=system`);
    expect(readMode()).toBe('system');
  });
});

describe('applyMode', () => {
  it('stamps the ground the cascade repaints from', () => {
    applyMode('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyMode('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('stamps system as the ABSENCE of the attribute, for the media query to answer', () => {
    applyMode('dark');
    applyMode('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('never moves the theme store on a browser, so nothing re-resolves', () => {
    const before = themeVersion();
    applyMode('light');
    applyMode('system');
    expect(themeVersion()).toBe(before);
  });
});

describe('resolveMode', () => {
  it('answers an explicit choice with itself', () => {
    expect(resolveMode('light')).toBe('light');
    expect(resolveMode('dark')).toBe('dark');
  });

  it('asks the system what system is, and reads anything unsaid as dark', () => {
    const scheme = vi.spyOn(Appearance, 'getColorScheme');
    scheme.mockReturnValue('light');
    expect(resolveMode('system')).toBe('light');
    scheme.mockReturnValue('dark');
    expect(resolveMode('system')).toBe('dark');
    scheme.mockReturnValue(null);
    expect(resolveMode('system')).toBe('dark');
  });
});
