import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Project } from '@kromatv/i18n/model';
import { catalogLayout, readProject } from '@kromatv/i18n/vite';
import { z } from 'zod';
import type { CatalogSet } from './set.ts';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const CORE = 'packages/core/src/locales';
const MODULES = 'modules';

/** The language a module is written in, whoever wrote it. */
const MODULE_SOURCE = 'en';

// A module follows the app's languages and their stages, measured against its
// own source. The app's source language is one its readers are promised whole,
// so a module owes it in full too.
function modulePolicy(app: Project): Project {
  return {
    source: MODULE_SOURCE,
    fallback: app.fallback,
    locales: { ...app.locales, [app.source]: { stage: 'stable' } },
  };
}

/** The package a module imports `useT` from, in this repository. */
const MODULE_SDK = '@kromatv/module-sdk';

/**
 * A module's messages as a set, written in English under `dir`: one
 * `locales/<code>.json` per language, or one `locales/<code>/` folder per
 * language where it keeps them the way the app does. Its key declaration goes
 * beside its front end, where it has one, and augments `target`, the package
 * that front end imports `useT` from.
 */
export function moduleSet(
  name: string,
  dir: string,
  project: Project,
  target: string = MODULE_SDK,
): CatalogSet {
  const ui = join(dir, 'ui', 'src');
  const locales = join(dir, 'locales');
  return {
    name,
    dir: locales,
    layout: catalogLayout(locales),
    project,
    ...(existsSync(ui) ? { types: { path: join(ui, 'messages.d.ts'), target } } : {}),
  };
}

const SITE = 'apps/www';

const SiteSettings = z.object({ baseLocale: z.string(), locales: z.array(z.string()) });

// The website is built by Paraglide from `messages/<locale>.json`, and ships
// the locales its inlang settings list. A file it does not list is a draft,
// whatever the app thinks of that language.
function siteSet(root: string, app: Project): CatalogSet | null {
  const settings = join(root, SITE, 'project.inlang', 'settings.json');
  if (!existsSync(settings)) {
    return null;
  }
  const { baseLocale, locales } = SiteSettings.parse(JSON.parse(readFileSync(settings, 'utf8')));
  const staged = modulePolicy(app).locales ?? {};
  return {
    name: 'www',
    dir: join(root, SITE, 'messages'),
    layout: 'flat',
    project: {
      source: baseLocale,
      fallback: app.fallback,
      locales: Object.fromEntries(
        locales.map((locale) => [locale, staged[locale] ?? { stage: 'beta' }]),
      ),
    },
  };
}

/** Every body of messages in this repository: the app's first, whose policy
 *  file the rest follow, then each module that ships any, then the website. */
export function workspace(root: string = REPO): CatalogSet[] {
  const dir = join(root, CORE);
  const project = readProject(dir);
  const core: CatalogSet = { name: 'core', dir, layout: 'folder', project };
  const modules = join(root, MODULES);
  if (!existsSync(modules)) {
    return [core];
  }
  const policy = modulePolicy(project);
  const sets = readdirSync(modules, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(modules, entry.name, 'locales')))
    .map((entry) => moduleSet(entry.name, join(modules, entry.name), policy))
    .sort((a, b) => a.name.localeCompare(b.name));
  const site = siteSet(root, project);
  return [core, ...sets, ...(site ? [site] : [])];
}
