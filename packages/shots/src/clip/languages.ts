import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const Policy = z.object({
  source: z.string().nonempty(),
  locales: z.record(z.string(), z.object({ stage: z.string().optional() })).default({}),
});

const OFFERED: ReadonlySet<string | undefined> = new Set(['beta', 'stable']);

const POLICY_FILE = 'packages/core/src/locales/i18n.json';

/** The languages a reader is offered by the policy of a catalog folder
 *  (`i18n.json`): its source language first, then every locale past `draft`,
 *  in the order the policy lists them. A locale it leaves out is a draft. */
export function offeredLanguages(policy: unknown): [string, ...string[]] {
  const { source, locales } = Policy.parse(policy);
  const offered = Object.entries(locales)
    .filter(([locale, { stage }]) => locale !== source && OFFERED.has(stage))
    .map(([locale]) => locale);
  return [source, ...offered];
}

/** The languages the product offers, from the core catalogs' `i18n.json`. */
export function productLanguages(repoDir: string): [string, ...string[]] {
  const policy: unknown = JSON.parse(readFileSync(join(repoDir, POLICY_FILE), 'utf8'));
  return offeredLanguages(policy);
}
