import { type Project, stageOf } from '@kromatv/i18n/model';
import { z } from 'zod';
import { LocaleTag, POLICY_FILE } from './config';

const LocalePolicy = z.object({ stage: z.string().optional(), fallback: LocaleTag.optional() });

const PolicyFile = z.object({
  source: LocaleTag,
  fallback: LocaleTag.optional(),
  locales: z.record(LocaleTag, LocalePolicy).optional(),
});

const Raw = z.record(z.string(), z.unknown());

/** An i18n project's `i18n.json`, or why it cannot be read. */
export function parsePolicy(
  text: string | undefined,
): { ok: true; policy: Project } | { ok: false; error: string } {
  if (text === undefined) {
    return { ok: false, error: `${POLICY_FILE} is missing` };
  }
  try {
    const result = PolicyFile.safeParse(JSON.parse(text));
    return result.success
      ? { ok: true, policy: result.data }
      : { ok: false, error: `${POLICY_FILE}: ${result.error.issues[0]?.message ?? 'invalid'}` };
  } catch {
    return { ok: false, error: `${POLICY_FILE} is not JSON` };
  }
}

/** Every language the policy names: the source first, then each locale it lists, whatever its stage. */
export function policyLocales(policy: Project): string[] {
  return [...new Set([policy.source, ...Object.keys(policy.locales ?? {})])];
}

/** The languages the policy holds complete, other than the source. */
export function stableLocales(policy: Project): string[] {
  return policyLocales(policy).filter(
    (locale) => locale !== policy.source && stageOf(policy, locale) === 'stable',
  );
}

function inline(value: unknown): string {
  const fields = Raw.safeParse(value);
  if (!fields.success) {
    return JSON.stringify(value);
  }
  const entries = Object.entries(fields.data).map(
    ([key, field]) => `${JSON.stringify(key)}: ${JSON.stringify(field)}`,
  );
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

function block(entries: readonly (readonly [string, string])[], indent: string): string {
  if (entries.length === 0) {
    return '{}';
  }
  const lines = entries.map(([key, value]) => `${indent}  ${JSON.stringify(key)}: ${value}`);
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

/** `i18n.json` with `locale` added as a draft after the locales it lists, every other line as the repository's formatter keeps it. */
export function withDraftLocale(text: string, locale: string): string {
  const root = Raw.parse(JSON.parse(text));
  const listed = Raw.safeParse(root.locales);
  const locales = { ...(listed.success ? listed.data : {}), [locale]: { stage: 'draft' } };
  const localeLines = Object.entries(locales).map(
    ([tag, policy]) => [tag, inline(policy)] as const,
  );
  const lines = Object.entries({ ...root, locales }).map(
    ([key, value]) => [key, key === 'locales' ? block(localeLines, '  ') : inline(value)] as const,
  );
  return `${block(lines, '')}\n`;
}
