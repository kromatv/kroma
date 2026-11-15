import { areaOf, type Language, languageOf } from './sources';

export interface UnmeasuredArea {
  area: string;
  language: Language;
  files: number;
}

export type Measured = (path: string) => boolean;

function recordedBelow(path: string, recorded: ReadonlySet<string>): boolean {
  const segments = path.split('/');
  for (let from = 1; from < segments.length - 1; from++) {
    if (recorded.has(segments.slice(from).join('/'))) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a report holds a record for a source file, however the report
 * spells it: from the repository root, from a directory inside it, or as an
 * absolute path in another checkout, which is what a report downloaded from
 * CI carries.
 */
export function measuredBy(recorded: ReadonlySet<string>): Measured {
  const elsewhere = [...recorded].filter((file) => file.startsWith('/'));
  return (path) =>
    recorded.has(path) ||
    recordedBelow(path, recorded) ||
    elsewhere.some((file) => file.endsWith(`/${path}`));
}

/** The languages with at least one measured source file. */
export function measuredLanguages(sources: readonly string[], measured: Measured): Set<Language> {
  const languages = new Set<Language>();
  for (const source of sources) {
    const language = languageOf(source);
    if (language !== undefined && !languages.has(language) && measured(source)) {
      languages.add(language);
    }
  }
  return languages;
}

interface Tally {
  area: string;
  language: Language;
  files: number;
  measured: number;
}

function tally(sources: readonly string[], measured: Measured): Tally[] {
  const tallies = new Map<string, Tally>();
  for (const source of sources) {
    const language = languageOf(source);
    if (language === undefined) {
      continue;
    }
    const area = areaOf(source);
    const key = `${area}\t${language}`;
    const known = tallies.get(key) ?? { area, language, files: 0, measured: 0 };
    known.files += 1;
    known.measured += measured(source) ? 1 : 0;
    tallies.set(key, known);
  }
  return [...tallies.values()];
}

/**
 * The areas where not one source file has a coverage record, although the
 * language is measured elsewhere: every function there reads 0%. A language
 * no report covers at all is left out, since it is scored on complexity alone.
 */
export function unmeasuredAreas(sources: readonly string[], measured: Measured): UnmeasuredArea[] {
  const languages = measuredLanguages(sources, measured);
  return tally(sources, measured)
    .filter((entry) => entry.measured === 0 && languages.has(entry.language))
    .map(({ area, language, files }) => ({ area, language, files }))
    .sort((a, b) => b.files - a.files || a.area.localeCompare(b.area));
}
