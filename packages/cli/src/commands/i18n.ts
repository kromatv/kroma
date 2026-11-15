import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project as Policy } from '@kromatv/i18n';
import { type CatalogSet, localesOf, moduleSet, run, writeTypes } from '@kromatv/i18n-tools';
import { PUBLIC_NAME } from '@kromatv/module-sdk/shared';
import { z } from 'zod';
import { findProjects, type Project } from '../project';

/** The language a module is written in. */
const SOURCE = 'en';

const IN_REPO_SDK = '@kromatv/module-sdk';

const Dependencies = z.looseObject({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

// The package a module imports `useT` from, which is the one its key
// declaration has to augment: the published SDK, or the workspace package for
// a module that lives in the KROMA repository.
function sdkOf(project: Project): string {
  const path = join(project.dir, 'package.json');
  if (!existsSync(path)) {
    return PUBLIC_NAME;
  }
  const { dependencies = {}, devDependencies = {} } = Dependencies.parse(
    JSON.parse(readFileSync(path, 'utf8')),
  );
  return IN_REPO_SDK in dependencies || IN_REPO_SDK in devDependencies ? IN_REPO_SDK : PUBLIC_NAME;
}

// Every language a module ships is one its readers get: the bundle carries
// each `locales/<code>.json`, and whatever one lacks reads in English.
function shipped(locales: readonly string[]): Policy {
  return {
    source: SOURCE,
    locales: Object.fromEntries(locales.map((locale) => [locale, { stage: 'beta' }])),
  };
}

/** A module's `locales/` as a catalog set, one file or one folder per
 *  language, whichever the module keeps. */
export function catalogsOf(project: Project): CatalogSet {
  const bare = moduleSet(project.manifest.id, project.dir, { source: SOURCE }, sdkOf(project));
  return { ...bare, project: shipped(localesOf(bare)) };
}

/** Bring a module's key declaration in line with its `locales/`, so the
 *  compiler checks the keys its front end names. Returns the paths written. */
export function writeMessageTypes(projects: readonly Project[]): string[] {
  return writeTypes(projects.map(catalogsOf));
}

export interface I18nOptions {
  argv: readonly string[];
  cwd?: string;
  print?: (text: string) => void;
}

/** `kroma i18n <command>`: the translation commands over this module, or over
 *  every module under `modules/`. */
export function i18nCommand({
  argv,
  cwd = process.cwd(),
  print = (text) => console.log(text),
}: I18nOptions): Promise<number> {
  return run(argv, {
    sets: findProjects([], cwd).map(catalogsOf),
    root: cwd,
    bin: 'kroma i18n',
    print,
  });
}
