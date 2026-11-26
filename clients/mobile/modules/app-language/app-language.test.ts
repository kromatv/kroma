import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: { native: { reach?: unknown; set?: (tag: string) => Promise<void> } | null } =
  vi.hoisted(() => ({ native: null }));

vi.mock('expo', () => ({
  requireOptionalNativeModule: () => env.native,
}));

async function load() {
  vi.resetModules();
  return import('./app-language.ts');
}

beforeEach(() => {
  env.native = null;
});

describe('what the app can do with the system setting for its language', () => {
  it('is nothing on a build without the native half', async () => {
    const { systemLanguageReach } = await load();

    expect(systemLanguageReach).toBe('none');
  });

  it('is what the native half says', async () => {
    env.native = { reach: 'open' };

    const { systemLanguageReach } = await load();

    expect(systemLanguageReach).toBe('open');
  });

  it('is nothing when the native half says something unknown', async () => {
    env.native = { reach: 'maybe' };

    const { systemLanguageReach } = await load();

    expect(systemLanguageReach).toBe('none');
  });
});

describe('handing a language to the system', () => {
  it('writes it where the app may set it', async () => {
    const set = vi.fn(async () => undefined);
    env.native = { reach: 'set', set };

    const { setSystemLanguage } = await load();
    await setSystemLanguage('fr');

    expect(set).toHaveBeenCalledExactlyOnceWith('fr');
  });

  it('writes nothing where the app can only open the setting', async () => {
    const set = vi.fn(async () => undefined);
    env.native = { reach: 'open', set };

    const { setSystemLanguage } = await load();
    await setSystemLanguage('fr');

    expect(set).not.toHaveBeenCalled();
  });

  it('does nothing on a build without the native half', async () => {
    const { setSystemLanguage } = await load();

    await expect(setSystemLanguage('fr')).resolves.toBeUndefined();
  });
});
