import { setSessionStorage } from '@kromatv/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStyleTestHost } from '#ui/testing-style';

const styleHost = createStyleTestHost();
const { setTheme, writeMode, activeTheme, applyMode } = styleHost;

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));

const store = new Map<string, string>();

const device = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

const unavailable = {
  getItem: (): string => {
    throw new Error('storage unavailable');
  },
  setItem: (): void => {
    throw new Error('storage unavailable');
  },
  removeItem: (): void => {
    throw new Error('storage unavailable');
  },
};

beforeEach(() => {
  store.clear();
  setSessionStorage(device);
});

afterEach(async () => {
  const { KROMA } = await import('./theme');
  setTheme(KROMA);
  setSessionStorage(null);
});

describe('the ground on a device', () => {
  it('keeps the choice in the device store, since there is no server to read a cookie', async () => {
    const { readMode } = await import('./theme-mode');
    writeMode('light');
    expect(store.get('kroma:theme')).toBe('light');
    expect(readMode()).toBe('light');
  });

  it('moves the theme store instead of stamping an attribute, having no cascade', async () => {
    const { KROMA, KROMA_LIGHT } = await import('./theme');

    applyMode('light');
    expect(activeTheme()).toBe(KROMA_LIGHT);
    applyMode('dark');
    expect(activeTheme()).toBe(KROMA);
  });

  it('resolves system through the device rather than a media query', async () => {
    const { Appearance } = await import('react-native');
    const { KROMA_LIGHT } = await import('./theme');

    vi.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
    applyMode('system');
    expect(activeTheme()).toBe(KROMA_LIGHT);
    vi.restoreAllMocks();
  });

  it('reads a stored value it does not know as system', async () => {
    const { readMode } = await import('./theme-mode');
    store.set('kroma:theme', 'ocean');
    expect(readMode()).toBe('system');
  });

  it('reads system when the device has no store at all', async () => {
    setSessionStorage(null);
    const { readMode } = await import('./theme-mode');
    writeMode('dark');
    expect(readMode()).toBe('system');
  });

  it('survives a device store that refuses to answer', async () => {
    setSessionStorage(unavailable);
    const { readMode } = await import('./theme-mode');
    expect(() => writeMode('light')).not.toThrow();
    expect(readMode()).toBe('system');
  });
});
