import { z } from 'zod';
import type { UnmeasuredArea } from './coverage';
import { readEdn } from './edn';
import type { Language } from './sources';

const named = {
  name: z.string(),
  namespace: z.string(),
  complexity: z.number().int().nonnegative(),
};

const Scored = z.object({ ...named, coverage: z.number(), crap: z.number() });
const ComplexityOnly = z.object({ ...named, coverage: z.null(), crap: z.null() });

const Snapshot = z.object({ entries: z.array(z.union([Scored, ComplexityOnly])) });

const WORTH_A_LOOK = 10;
const UNDER_TESTED = 30;

export type ScoredEntry = z.infer<typeof Scored>;
export type CrapEntry = ScoredEntry | z.infer<typeof ComplexityOnly>;

export interface CrapSummary {
  functions: number;
  atLeast10: number;
  atLeast30: number;
  uncovered: number;
  worst: ScoredEntry[];
  worstTested: ScoredEntry[];
  mostComplex: CrapEntry[];
}

export interface LanguageCrap {
  language: Language;
  scored: boolean;
  summary: CrapSummary;
}

export interface CrapReport {
  languages: LanguageCrap[];
  unmeasured: UnmeasuredArea[];
  coverageReports: string[];
}

/** The entries of a snapshot crapper wrote. Coverage and CRAP are null where it scored complexity alone. */
export function parseCrapSnapshot(edn: string): CrapEntry[] {
  return Snapshot.parse(readEdn(edn)).entries;
}

const label = (entry: CrapEntry) => `${entry.namespace}::${entry.name}`;

const isScored = (entry: CrapEntry): entry is ScoredEntry => entry.crap !== null;

const byCrap = (a: ScoredEntry, b: ScoredEntry) =>
  b.crap - a.crap || label(a).localeCompare(label(b));

const byComplexity = (a: CrapEntry, b: CrapEntry) =>
  b.complexity - a.complexity || label(a).localeCompare(label(b));

const atLeast = (entries: readonly ScoredEntry[], threshold: number) =>
  entries.filter((entry) => entry.crap >= threshold).length;

/** The counts a report leads with, and the `limit` worst functions by each of its three orders. */
export function summarizeCrap(entries: readonly CrapEntry[], limit: number): CrapSummary {
  const scored = entries.filter(isScored).sort(byCrap);
  return {
    functions: entries.length,
    atLeast10: atLeast(scored, WORTH_A_LOOK),
    atLeast30: atLeast(scored, UNDER_TESTED),
    uncovered: scored.filter((entry) => entry.coverage === 0).length,
    worst: scored.slice(0, limit),
    worstTested: scored.filter((entry) => entry.coverage > 0).slice(0, limit),
    mostComplex: [...entries].sort(byComplexity).slice(0, limit),
  };
}
