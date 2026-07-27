// A person's PROVIDER profile: the biography and the life facts a client shows
// above their filmography, formatted for reading.
//
// Distinct from `./people`, which matches credits inside the library's own
// metadata. Nothing here touches the catalogue: it takes the profile the server
// fetched from TMDB (`GET /api/people/details`) and turns it into localized
// lines. Kept apart so a client that only lists credits never pulls in date
// formatting.

import type { Translate } from './i18n';

/** Whole years between two `YYYY-MM-DD` dates (the second defaults to today),
 * i.e. an age, or null when the birth date is missing or unparseable. */
export function personAge(
  birthday: string | null | undefined,
  deathday?: string | null,
  today: Date = new Date(),
): number | null {
  const born = parseDay(birthday);
  if (!born) return null;
  const end = parseDay(deathday) ?? today;
  let age = end.getFullYear() - born.getFullYear();
  // Not yet had the birthday this year.
  const monthDiff = end.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < born.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

/** `YYYY-MM-DD` at local midnight (never UTC: `new Date('1988-04-30')` is UTC
 * midnight, which is the day before in the Americas). Null when unparseable. */
function parseDay(day: string | null | undefined): Date | null {
  if (!day) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A `YYYY-MM-DD` provider date written out in the reader's locale ("30 avril
 * 1988"). Falls back to the raw string when the runtime has no Intl data. */
export function formatDay(day: string | null | undefined, locale?: string): string | null {
  const date = parseDay(day);
  if (!date) return null;
  try {
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return day ?? null;
  }
}

/** One labelled line of a person's biography panel. */
export interface PersonFact {
  key: 'born' | 'died' | 'birthplace' | 'knownFor';
  label: string;
  value: string;
}

/** The facts under a person's name: born (with a living person's age), died
 * (with the age they reached), birthplace, and what the provider knows them
 * for. Only the facts the provider actually filled in are returned, so a client
 * renders the list as-is. */
export function personFacts(
  t: Translate,
  detail: PersonDetailFacts | null | undefined,
  locale?: string,
): PersonFact[] {
  if (!detail) return [];
  const facts: PersonFact[] = [];
  const born = formatDay(detail.birthday, locale);
  const age = personAge(detail.birthday, detail.deathday);
  if (born) {
    // The age belongs to the birth line while they live, and to the death line
    // once they don't ("1930 - 2014 (84 ans)" reads wrong on the birth line).
    const value = age != null && !detail.deathday ? t('person.bornAge', { date: born, age }) : born;
    facts.push({ key: 'born', label: t('person.born'), value });
  }
  const died = formatDay(detail.deathday, locale);
  if (died) {
    const value = age != null ? t('person.diedAge', { date: died, age }) : died;
    facts.push({ key: 'died', label: t('person.died'), value });
  }
  if (detail.placeOfBirth) {
    facts.push({ key: 'birthplace', label: t('person.birthplace'), value: detail.placeOfBirth });
  }
  const known = departmentLabel(t, detail.knownFor);
  if (known) facts.push({ key: 'knownFor', label: t('person.knownFor'), value: known });
  return facts;
}

/** Just the fields {@link personFacts} reads, so callers can pass a provider
 * profile without the module depending on the wire type's shape. */
export interface PersonDetailFacts {
  biography?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  placeOfBirth?: string | null;
  knownFor?: string | null;
}

/** The localized label for TMDB's `known_for_department` vocabulary (verbatim
 * when it is a department we don't translate). */
export function departmentLabel(
  t: Translate,
  department: string | null | undefined,
): string | null {
  switch (department) {
    case 'Acting':
      return t('person.dept.acting');
    case 'Directing':
      return t('person.dept.directing');
    case 'Writing':
      return t('person.dept.writing');
    case 'Production':
      return t('person.dept.production');
    case 'Sound':
      return t('person.dept.sound');
    case 'Camera':
      return t('person.dept.camera');
    default:
      return department || null;
  }
}
