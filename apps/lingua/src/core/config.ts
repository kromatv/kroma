import { z } from 'zod';

const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** A BCP 47 tag as a locale folder is named: `fr`, `pt-BR`, `zh-Hant`. */
export const LocaleTag = z.string().regex(LOCALE, 'must be a language tag, like de or pt-BR');

const FolderPath = z
  .string()
  .max(256)
  .regex(/^[\w.-]+(?:\/[\w.-]+)*$/, 'must be a folder relative to the repository root')
  .refine(
    (path) => !path.split('/').some((segment) => segment === '.' || segment === '..'),
    'must stay inside the repository',
  );

/** `lingua.json` at a repository's root: the folder of the i18n project to translate, and where its Lingua runs. */
export const LinguaConfig = z.object({
  url: z.url({ protocol: /^https$/ }).optional(),
  projects: z
    .array(z.object({ path: FolderPath }))
    .length(1, 'must name exactly one project: Lingua translates one per repository'),
});
export type LinguaConfig = z.infer<typeof LinguaConfig>;

/** Where a repository keeps its `lingua.json`. */
export const CONFIG_PATH = 'lingua.json';

/** The policy file beside the locale folders. */
export const POLICY_FILE = 'i18n.json';

/** What a translator is told, beside the locale folders. */
export const NOTES_FILE = 'notes.json';

/** The translation state of one locale, in its folder. */
export const LOCK_FILE = 'i18n.lock';

/** What a file of an i18n project is to Lingua. */
export type FileKind = 'policy' | 'notes' | 'lock' | 'catalog';

/** Where a file sits in its project; `locale` is empty for `i18n.json` and `notes.json`, `file` names a catalog (`admin/backup`). */
export interface Place {
  kind: FileKind;
  locale: string;
  file: string;
}

const EXTENSION = '.json';

function placeUnder(locale: string, below: string): Place | null {
  if (!LOCALE.test(locale) || below === '') {
    return null;
  }
  if (below === LOCK_FILE) {
    return { kind: 'lock', locale, file: '' };
  }
  return below.endsWith(EXTENSION)
    ? { kind: 'catalog', locale, file: below.slice(0, -EXTENSION.length) }
    : null;
}

/** What `path` is to the project in the folder `root`, or null when it is nothing Lingua reads. */
export function placeOf(root: string, path: string): Place | null {
  if (!path.startsWith(`${root}/`)) {
    return null;
  }
  const rest = path.slice(root.length + 1);
  if (rest === POLICY_FILE) {
    return { kind: 'policy', locale: '', file: '' };
  }
  if (rest === NOTES_FILE) {
    return { kind: 'notes', locale: '', file: '' };
  }
  const cut = rest.indexOf('/');
  return cut === -1 ? null : placeUnder(rest.slice(0, cut), rest.slice(cut + 1));
}

/** The repository path of a file of the project in the folder `root`. */
export function pathOf(root: string, place: Place): string {
  if (place.kind === 'catalog') {
    return `${root}/${place.locale}/${place.file}${EXTENSION}`;
  }
  if (place.kind === 'lock') {
    return `${root}/${place.locale}/${LOCK_FILE}`;
  }
  return `${root}/${place.kind === 'policy' ? POLICY_FILE : NOTES_FILE}`;
}

/** The folder of the project `config` names. */
export function rootOf(config: LinguaConfig): string {
  const [project] = config.projects;
  return project?.path ?? '';
}

/** Read `lingua.json` text, or say in one sentence why it is not usable. */
export function parseConfig(
  text: string,
): { ok: true; config: LinguaConfig } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: `${CONFIG_PATH} is not JSON` };
  }
  const result = LinguaConfig.safeParse(json);
  if (result.success) {
    return { ok: true, config: result.data };
  }
  const issue = result.error.issues[0];
  const where = issue?.path.join('.') ?? '';
  const field = where ? where + ': ' : '';
  return { ok: false, error: `${CONFIG_PATH}: ${field}${issue?.message ?? 'invalid'}` };
}
