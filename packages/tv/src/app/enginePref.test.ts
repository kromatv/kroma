import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ current: { OS: 'web' } as Record<string, unknown> }));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get Platform() {
      return platform.current;
    },
  };
});

import { availableEngines, ENGINE_LABEL_KEY, type EnginePref } from './enginePref';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    _map: m,
  };
}

const tauri = { core: { invoke: () => undefined }, event: { listen: () => undefined } };

beforeEach(() => {
  platform.current = { OS: 'web' };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getEnginePref / setEnginePref', () => {
  // The pref reads storage on every get until this session picks an engine, so
  // each test imports a fresh module instance to reset that choice.
  async function fresh(storage: unknown) {
    vi.resetModules();
    vi.stubGlobal('localStorage', storage);
    return import('./enginePref');
  }

  it('defaults to auto when nothing is stored', async () => {
    const m = await fresh(fakeStorage());
    expect(m.getEnginePref()).toBe('auto');
  });

  it('returns a stored valid preference', async () => {
    const m = await fresh(fakeStorage({ 'kroma:engine': 'avplay' }));
    expect(m.getEnginePref()).toBe('avplay');
  });

  it('ignores an unknown stored value', async () => {
    const m = await fresh(fakeStorage({ 'kroma:engine': 'bogus' }));
    expect(m.getEnginePref()).toBe('auto');
  });

  it('persists the preference', async () => {
    const store = fakeStorage();
    const m = await fresh(store);
    m.setEnginePref('remux');
    expect(store._map.get('kroma:engine')).toBe('remux');
    expect(m.getEnginePref()).toBe('remux');
  });

  it('swallows storage errors on read and write', async () => {
    const m = await fresh({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(m.getEnginePref()).toBe('auto');
    expect(() => m.setEnginePref('mpv')).not.toThrow();
    expect(m.getEnginePref()).toBe('mpv');
  });

  it('reads a store installed after this module was evaluated', async () => {
    const late = new Map<string, string>();
    const m = await fresh({
      getItem: (k: string) => late.get(k) ?? null,
      setItem: (k: string, v: string) => void late.set(k, v),
    });

    expect(m.getEnginePref()).toBe('auto');
    late.set('kroma:engine', 'vlc');

    expect(m.getEnginePref()).toBe('vlc');
  });

  it('keeps the choice made here over a later store change', async () => {
    const store = fakeStorage();
    const m = await fresh(store);

    m.setEnginePref('remux');
    store._map.set('kroma:engine', 'vlc');

    expect(m.getEnginePref()).toBe('remux');
  });
});

describe('availableEngines', () => {
  it('offers avplay + remux on Tizen', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)' });
    expect(availableEngines()).toEqual(['auto', 'avplay', 'shaka', 'remux']);
  });

  it('offers webview + remux on webOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Web0S; LG)' });
    expect(availableEngines()).toEqual(['auto', 'webview', 'shaka', 'remux']);
  });

  it('falls back to webview + remux on an unknown platform', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' });
    expect(availableEngines()).toEqual(['auto', 'webview', 'shaka', 'remux']);
  });

  it('inserts mpv on a Linux Tauri desktop shell', () => {
    vi.stubGlobal('__TAURI__', tauri);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Tauri' });
    expect(availableEngines()).toEqual(['auto', 'mpv', 'webview', 'shaka', 'remux']);
  });

  it('inserts mpv on a macOS Tauri shell that flagged libmpv', () => {
    vi.stubGlobal('__TAURI__', tauri);
    vi.stubGlobal('__KROMA_MPV__', true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Tauri' });
    expect(availableEngines()).toEqual(['auto', 'mpv', 'webview', 'shaka', 'remux']);
  });

  it('offers only the original file or the remux on a native shell', () => {
    platform.current = { OS: 'ios', isTV: true };
    expect(availableEngines()).toEqual(['auto', 'remux']);
    platform.current = { OS: 'android', isTV: true };
    expect(availableEngines()).toEqual(['auto', 'remux']);
  });

  it('drops shaka on the legacy tier, which does not ship it', () => {
    vi.stubGlobal('__KROMA_LEGACY_TIER__', true);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Web0S; LG)' });
    expect(availableEngines()).toEqual(['auto', 'webview', 'remux']);
  });

  it('falls back to the browser list where there is no navigator to read', () => {
    vi.stubGlobal('navigator', undefined);
    expect(availableEngines()).toEqual(['auto', 'webview', 'shaka', 'remux']);
  });

  it('does NOT insert mpv on a Tauri Android shell', () => {
    vi.stubGlobal('__TAURI__', tauri);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 12) Tauri' });
    expect(availableEngines()).toEqual(['auto', 'webview', 'shaka', 'remux']);
  });
});

describe('ENGINE_LABEL_KEY', () => {
  it('maps every engine to its i18n label key', () => {
    const engines: EnginePref[] = ['auto', 'avplay', 'webview', 'shaka', 'remux', 'mpv'];
    for (const e of engines) {
      expect(ENGINE_LABEL_KEY[e]).toBe(`playbackEngine.${e}`);
    }
  });
});
