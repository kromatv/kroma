import { z } from 'zod';

const LOCALE_PATTERN = '[a-z]{2,3}(?:-[a-z0-9]{2,8})*';
const NAMESPACE_PATTERN = '[A-Za-z0-9][A-Za-z0-9_.-]*';

/** A lowercase BCP 47 tag, the way catalogs name their folders: `fr`, `pt-br`. */
export const LocaleTag = z
  .string()
  .regex(new RegExp(`^${LOCALE_PATTERN}$`), 'must be a lowercase language tag');

const NamespaceName = z.string().regex(new RegExp(`^${NAMESPACE_PATTERN}$`));

const Template = z
  .string()
  .nonempty()
  .max(256)
  .refine(
    (path) =>
      path.split('{locale}').length === 2 &&
      path.split('{namespace}').length === 2 &&
      !path.startsWith('/') &&
      !path.split('/').includes('..'),
    'must name {locale} and {namespace} once each, relative to the repository root',
  );

/** `lingua.json` at a repository's root: what Lingua translates there, and where it lives. */
export const LinguaConfig = z.object({
  source: LocaleTag,
  references: z.array(LocaleTag).max(8).default([]),
  locales: z.array(LocaleTag).min(1).max(200),
  catalogs: z
    .array(z.object({ path: Template }))
    .min(1)
    .max(16),
});
export type LinguaConfig = z.infer<typeof LinguaConfig>;

/** Where a repository keeps its `lingua.json`. */
export const CONFIG_PATH = 'lingua.json';

/** One catalog file in a repository, named by the language and the namespace it holds. */
export interface CatalogFile {
  path: string;
  catalog: number;
  locale: string;
  namespace: string;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher(template: string): RegExp {
  const pattern = escape(template)
    .replace(escape('{locale}'), `(?<locale>${LOCALE_PATTERN})`)
    .replace(escape('{namespace}'), `(?<namespace>${NAMESPACE_PATTERN})`);
  return new RegExp(`^${pattern}$`);
}

/** Which catalog `path` is, or null when no template in the config names it. */
export function matchCatalog(config: LinguaConfig, path: string): CatalogFile | null {
  for (const [catalog, { path: template }] of config.catalogs.entries()) {
    const groups = matcher(template).exec(path)?.groups;
    if (groups?.locale && groups.namespace) {
      return { path, catalog, locale: groups.locale, namespace: groups.namespace };
    }
  }
  return null;
}

/** The path a catalog template gives one language's copy of one namespace. */
export function catalogPath(template: string, locale: string, namespace: string): string {
  LocaleTag.parse(locale);
  NamespaceName.parse(namespace);
  return template.replace('{locale}', locale).replace('{namespace}', namespace);
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
