import type { Metadata } from '@kroma/client';
import type { Translate } from './i18n';
import { slugify } from './slug';

/** The URL segment one person is reached by: the provider's id when their
 * credit kept one, the folded name when it did not. Every credit stored before
 * the id was kept has none, which is why a person URL is not always a number. */
export function personSegment(person: Readonly<{ name: string; tmdbId?: number | null }>): string {
  return person.tmdbId == null ? slugify(person.name) : String(person.tmdbId);
}

function samePerson(a: string, b: string): boolean {
  const slug = slugify(a);
  return slug !== '' && slug === slugify(b);
}

/** Does `meta` credit `name` in its cast OR key crew? `name` is a display name
 * or a URL slug. */
export function creditsPerson(meta: Metadata | null | undefined, name: string): boolean {
  if (!meta || !name.trim()) return false;
  return (
    (meta.cast ?? []).some((c) => samePerson(c.name, name)) ||
    (meta.crew ?? []).some((c) => samePerson(c.name, name))
  );
}

/** One person's involvement aggregated across a set of titles' metadata: whether
 * they appear in any cast, the distinct crew jobs they held (e.g. `Director`), and
 * the best profile photo found among the matching credits. */
export interface PersonInvolvement {
  acted: boolean;
  jobs: string[];
  profileUrl: string | null;
}

type CastCredit = NonNullable<Metadata['cast']>[number];
type CrewCredit = NonNullable<Metadata['crew']>[number];

function scanCast(acc: PersonInvolvement, cast: readonly CastCredit[], name: string): void {
  for (const c of cast) {
    if (!samePerson(c.name, name)) continue;
    acc.acted = true;
    if (!acc.profileUrl && c.profileUrl) acc.profileUrl = c.profileUrl;
  }
}

function scanCrew(acc: PersonInvolvement, crew: readonly CrewCredit[], name: string): void {
  for (const c of crew) {
    if (!samePerson(c.name, name)) continue;
    if (!acc.jobs.includes(c.job)) acc.jobs.push(c.job);
    if (!acc.profileUrl && c.profileUrl) acc.profileUrl = c.profileUrl;
  }
}

/** Aggregate {@link PersonInvolvement} for `name` over many titles' metadata. */
export function personInvolvement(
  metas: ReadonlyArray<Metadata | null | undefined>,
  name: string,
): PersonInvolvement {
  const acc: PersonInvolvement = { acted: false, jobs: [], profileUrl: null };
  for (const meta of metas) {
    if (!meta) continue;
    scanCast(acc, meta.cast ?? [], name);
    scanCrew(acc, meta.crew ?? [], name);
  }
  return acc;
}

/** The spelling titles' metadata holds for a person, recovered from the slug or
 * the differently-cased name a URL carried. Falls back to `name`. */
export function personDisplayName(
  metas: ReadonlyArray<Metadata | null | undefined>,
  name: string,
): string {
  for (const meta of metas) {
    if (!meta) continue;
    for (const c of meta.cast ?? []) if (samePerson(c.name, name)) return c.name;
    for (const c of meta.crew ?? []) if (samePerson(c.name, name)) return c.name;
  }
  return name;
}

/** Localized role chips for a person: "Acteur" for any cast credit, then each
 * distinct crew job (known jobs translated; anything else shown verbatim). */
export function roleLabels(t: Translate, inv: PersonInvolvement): string[] {
  const roles: string[] = [];
  if (inv.acted) roles.push(t('person.role.actor'));
  for (const job of inv.jobs) roles.push(jobLabel(t, job));
  return [...new Set(roles)];
}

/** The localized label for a single crew job (verbatim when unknown). */
export function jobLabel(t: Translate, job: string): string {
  switch (job) {
    case 'Director':
      return t('person.role.director');
    case 'Writer':
      return t('person.role.writer');
    case 'Creator':
      return t('person.role.creator');
    default:
      return job;
  }
}
