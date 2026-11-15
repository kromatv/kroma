import {
  type Catalog,
  generalForm,
  groupMessages,
  type Message,
  namespaceOf,
  parentTags,
  type Stage,
  stageOf,
  variantOf,
} from '@kromatv/i18n/model';
import { digest, type Lock, type LockEntry, readLock } from './lock.ts';
import {
  type CatalogSet,
  type LocaleFiles,
  localesOf,
  lockPath,
  merged,
  readFiles,
  WHOLE,
} from './set.ts';

export interface Tally {
  total: number;
  translated: number;
  /** Among the translated: written by a machine and reviewed by nobody yet. */
  unreviewed: number;
  /** Not written here, and read from the language this one is a region of. */
  inherited: number;
  outdated: number;
  missing: number;
}

export function emptyTally(): Tally {
  return { total: 0, translated: 0, unreviewed: 0, inherited: 0, outdated: 0, missing: 0 };
}

export function addTally(into: Tally, from: Tally): Tally {
  into.total += from.total;
  into.translated += from.translated;
  into.unreviewed += from.unreviewed;
  into.inherited += from.inherited;
  into.outdated += from.outdated;
  into.missing += from.missing;
  return into;
}

/** The share of messages a reader gets in their own language: the ones it
 *  writes, the ones it takes from the language it is a region of, and the
 *  outdated ones, which are shown, only not as the source now says it. */
export function coverage(tally: Tally): number {
  if (tally.total === 0) return 1;
  return (tally.translated + tally.inherited + tally.outdated) / tally.total;
}

/** The source language of a set, read once and shared by every locale that is
 *  measured against it. */
export interface Source {
  readonly locale: string;
  readonly files: LocaleFiles;
  readonly catalog: Catalog;
  readonly messages: ReadonlyMap<string, Message>;
  readonly bases: Set<string>;
  /** The file each of its keys is written in. */
  readonly home: ReadonlyMap<string, string>;
}

export function readSource(set: CatalogSet): Source {
  const locale = set.project.source;
  const files = readFiles(set, locale);
  const catalog = merged(files);
  const { messages } = groupMessages(catalog);
  const home = new Map<string, string>();
  for (const [file, own] of files) for (const key of Object.keys(own)) home.set(key, file);
  return { locale, files, catalog, messages, bases: new Set(messages.keys()), home };
}

/**
 * The file a key belongs in: wherever the source language wrote it, so every
 * language is split the way the source is. A plural variant only a translation
 * has goes with its base, and a key the source does not know falls to the file
 * named after its namespace.
 */
export function fileOf(set: CatalogSet, source: Source, key: string): string {
  if (set.layout === 'flat') return WHOLE;
  const written = source.home.get(key);
  if (written !== undefined) return written;
  const base = variantOf(key, source.bases)?.base ?? key;
  return source.home.get(base) ?? source.home.get(`${base}_other`) ?? namespaceOf(key);
}

/** How one locale of one set stands against its source. */
export interface LocaleStatus {
  readonly set: string;
  readonly locale: string;
  readonly stage: Stage;
  readonly tally: Tally;
  /** The same count, by catalog file. */
  readonly files: ReadonlyMap<string, Tally>;
  readonly missing: readonly string[];
  readonly outdated: readonly string[];
  /** Translated by a machine, and waiting for someone to read them. */
  readonly unreviewed: readonly string[];
  /** Keys the source language has no message for. */
  readonly strays: readonly string[];
  readonly messages: ReadonlyMap<string, Message>;
  /** The lock as it stands on disk, and as these files say it should read. */
  readonly lock: Lock;
  readonly nextLock: Lock;
}

function translatedIn(message: Message | undefined): message is Message {
  return message !== undefined && Boolean(generalForm(message));
}

// What a regional locale does not have to write: the messages of the language
// its tag belongs to, `fr` for `fr-CH`. Another language it falls back to is
// not that: a German reader of an English sentence is missing a translation.
function inheritedBy(set: CatalogSet, source: Source, locale: string): Set<string> {
  const known = new Set(localesOf(set));
  const inherited = new Set<string>();
  for (const parent of parentTags(locale)) {
    if (!known.has(parent)) continue;
    const catalog = parent === source.locale ? source.catalog : merged(readFiles(set, parent));
    for (const [key, message] of groupMessages(catalog, source.bases).messages) {
      if (translatedIn(message)) inherited.add(key);
    }
  }
  return inherited;
}

// What the lock should say of one translation, given what it said. The source
// moving while the translation stands still is what outdated means; anything
// else is recorded as it now reads, and stays a machine's only while nobody
// has touched it.
function reconciled(
  from: string,
  said: string,
  recorded: LockEntry | undefined,
): { recorded: LockEntry; outdated: boolean } {
  const untouched = recorded?.translation === said;
  if (recorded && untouched && recorded.source !== from) return { recorded, outdated: true };
  const entry: LockEntry =
    untouched && recorded?.machine
      ? { source: from, translation: said, machine: true }
      : { source: from, translation: said };
  return { recorded: entry, outdated: false };
}

type Standing = 'missing' | 'inherited' | 'translated' | 'outdated' | 'unreviewed';

interface Measured {
  readonly source: Source;
  readonly locale: string;
  readonly messages: ReadonlyMap<string, Message>;
  readonly inherited: ReadonlySet<string>;
  readonly lock: Lock;
  readonly nextLock: Lock;
}

// Where one message stands in a locale, recording what its lock entry should
// now say on the way.
function standingOf(message: Message, measured: Measured): Standing {
  const translation = measured.messages.get(message.key);
  if (!translatedIn(translation)) {
    return measured.inherited.has(message.key) ? 'inherited' : 'missing';
  }
  if (measured.locale === measured.source.locale) return 'translated';
  const entry = reconciled(digest(message), digest(translation), measured.lock.get(message.key));
  measured.nextLock.set(message.key, entry.recorded);
  if (entry.outdated) return 'outdated';
  return entry.recorded.machine ? 'unreviewed' : 'translated';
}

/**
 * Measure `locale` against the source. A message the locale does not write is
 * `inherited` when the language its tag belongs to has it, and `missing`
 * otherwise. One it writes is `outdated` when the source has moved since the
 * lock recorded the translation and the translation has not, and `translated`
 * otherwise. A translation the lock has never seen counts as current, which is
 * what the next sync records. One a machine wrote stays `unreviewed` until a
 * person edits it or accepts it.
 */
export function inspectLocale(set: CatalogSet, source: Source, locale: string): LocaleStatus {
  const stage = stageOf(set.project, locale);
  const tally = emptyTally();
  const files = new Map<string, Tally>();
  const missing: string[] = [];
  const outdated: string[] = [];
  const unreviewed: string[] = [];
  const lock = locale === source.locale ? new Map() : readLock(lockPath(set, locale));
  const nextLock: Lock = new Map();
  const own = locale === source.locale ? source.catalog : merged(readFiles(set, locale));
  const { messages, strays } = groupMessages(own, source.bases);
  const inherited = inheritedBy(set, source, locale);

  const count = (key: string, state: keyof Tally) => {
    const at = fileOf(set, source, key);
    const file = files.get(at) ?? emptyTally();
    files.set(at, file);
    tally[state] += 1;
    file[state] += 1;
  };
  const listed: Partial<Record<Standing, string[]>> = { missing, outdated, unreviewed };
  for (const message of source.messages.values()) {
    const state = standingOf(message, { source, locale, messages, inherited, lock, nextLock });
    count(message.key, 'total');
    count(message.key, state === 'unreviewed' ? 'translated' : state);
    if (state === 'unreviewed') count(message.key, 'unreviewed');
    listed[state]?.push(message.key);
  }

  return {
    set: set.name,
    locale,
    stage,
    tally,
    files,
    missing,
    outdated,
    unreviewed,
    strays,
    messages,
    lock,
    nextLock,
  };
}

/** Every language the workspace knows: the folders of its first set, which is
 *  the app's, and whatever a later set ships beyond them. */
export function workspaceLocales(sets: readonly CatalogSet[]): string[] {
  const seen = new Set<string>();
  for (const set of sets) for (const locale of localesOf(set)) seen.add(locale);
  const [primary] = sets;
  const first = primary ? [primary.project.source] : [];
  return [...new Set([...first, ...[...seen].sort((a, b) => a.localeCompare(b))])];
}

/** One language across every set. */
export interface LanguageStatus {
  readonly locale: string;
  readonly stage: Stage;
  readonly source: boolean;
  readonly tally: Tally;
  readonly sets: readonly LocaleStatus[];
}

/** How every language stands, the source language of the first set leading. */
export function inspectWorkspace(sets: readonly CatalogSet[]): LanguageStatus[] {
  const [primary] = sets;
  if (!primary) return [];
  const sources = new Map(sets.map((set) => [set.name, readSource(set)]));
  return workspaceLocales(sets).map((locale) => {
    const statuses = sets.map((set) => inspectLocale(set, sources.get(set.name) as Source, locale));
    const tally = statuses.reduce((sum, status) => addTally(sum, status.tally), emptyTally());
    return {
      locale,
      stage: stageOf(primary.project, locale),
      source: locale === primary.project.source,
      tally,
      sets: statuses,
    };
  });
}
