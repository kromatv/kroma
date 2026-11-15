import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { workspace } from '@kromatv/i18n-tools';
import { afterEach, describe, expect, it } from 'vitest';
import { appSets } from './app-sets.ts';

const made: string[] = [];

function repository(files: Record<string, object>): string {
  const root = mkdtempSync(join(tmpdir(), 'kroma-i18n-devtools-repo-'));
  made.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(content));
  }
  return root;
}

const APP = {
  'packages/core/src/locales/i18n.json': { source: 'fr', fallback: 'en' },
  'packages/core/src/locales/fr/nav.json': { 'nav.home': 'Accueil' },
};

const MODULE = { 'modules/tv.kroma.vpn/locales/en.json': { 'vpn.connect': 'Connect' } };

const WEBSITE = {
  'apps/www/project.inlang/settings.json': { baseLocale: 'en', locales: ['en', 'fr'] },
  'apps/www/messages/en.json': { hero: 'Your media' },
};

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('the sets the running app renders', () => {
  it('are its own and each module, and never the website the workspace also holds', () => {
    const root = repository({ ...APP, ...MODULE, ...WEBSITE });

    const names = appSets(root).map((set) => set.name);

    expect(names).toEqual(['core', 'tv.kroma.vpn']);
    expect(workspace(root).map((set) => set.name)).toContain('www');
  });

  it('is the app alone in a repository that ships no module', () => {
    const root = repository({ ...APP, ...WEBSITE });

    expect(appSets(root).map((set) => set.name)).toEqual(['core']);
  });
});
