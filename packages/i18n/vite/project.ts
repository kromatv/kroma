import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { type Project, STAGES } from '../src/project.ts';

/** The policy file, at the top of the catalog folder beside the locales. */
export const PROJECT_FILE = 'i18n.json';

/** A BCP 47 tag as a locale folder is named: `fr`, `pt-BR`, `zh-Hant`. */
export const LOCALE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

const Tag = z.string().regex(LOCALE_TAG);

const ProjectFile = z.strictObject({
  $schema: z.string().optional(),
  source: Tag,
  fallback: Tag.optional(),
  locales: z
    .record(Tag, z.strictObject({ stage: z.enum(STAGES).optional(), fallback: Tag.optional() }))
    .optional(),
});

/** Parse the text of an `i18n.json`, refusing a field it does not know. */
export function parseProject(text: string): Project {
  const { $schema: _pointer, ...project } = ProjectFile.parse(JSON.parse(text));
  return project;
}

/** The project a catalog folder declares. A folder without the file cannot
 *  say which language it is written in, so there is no default to fall to. */
export function readProject(dir: string): Project {
  const path = join(dir, PROJECT_FILE);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing: it names the language the catalogs are written in`);
  }
  try {
    return parseProject(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path} is not a valid i18n project`, { cause: error });
  }
}
