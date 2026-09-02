import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TYPES_FILE } from '@kroma/i18n/vite';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE_CODE } from '../src/locales/default-locale.ts';
import { CORE_LOCALES, kromaCatalogs } from './index.ts';

interface Hooks {
  name: string;
  configResolved: (this: unknown) => void;
  resolveId: (this: unknown, id: string) => string | undefined;
  load: (this: unknown, id: string) => string | undefined;
}

const hooks = (eager?: boolean): Hooks => kromaCatalogs({ eager }) as unknown as Hooks;

describe('kromaCatalogs', () => {
  it('points the catalog plugin at the core folder and its default locale', () => {
    const plugin = hooks();
    plugin.configResolved.call(null);

    expect(plugin.name).toBe('kroma:catalogs');
    expect(existsSync(join(CORE_LOCALES, DEFAULT_LOCALE_CODE, 'lang.json'))).toBe(true);
    expect(existsSync(join(CORE_LOCALES, TYPES_FILE))).toBe(true);
  });

  it('serves a core namespace as one loader per locale, or eagerly when asked', () => {
    const lazy = hooks();
    const eager = hooks(true);
    lazy.configResolved.call(null);
    eager.configResolved.call(null);

    const id = lazy.resolveId.call(null, 'virtual:kroma-catalog/nav') ?? '';

    expect(lazy.load.call(null, id)).toContain(`() => import(`);
    expect(eager.load.call(null, id)).toContain('import catalog0 from');
  });
});
