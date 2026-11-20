import { z } from 'zod';
import { readEdn } from './edn';

const Span = z
  .object({
    file: z.string(),
    'start-line': z.number().int(),
    'end-line': z.number().int(),
  })
  .transform((span) => ({ file: span.file, start: span['start-line'], end: span['end-line'] }));

const Candidate = z.object({
  score: z.number(),
  language: z.string(),
  left: Span,
  right: Span,
});

const Snapshot = z.object({ candidates: z.array(Candidate) });

export type Span = z.infer<typeof Span>;
export type Duplicate = z.infer<typeof Candidate>;

export interface SplitDuplicates {
  production: Duplicate[];
  test: Duplicate[];
}

export interface Cluster {
  forms: Span[];
  lines: number;
}

export interface DrySummary {
  production: number;
  test: number;
  exact: number;
  crossFile: number;
  clusters: number;
  largestClusters: Cluster[];
  largestPairs: Duplicate[];
}

export interface DryReport {
  threshold: number;
  summary: DrySummary;
}

const EXACT = 0.9999;

/** The candidate pairs of a snapshot dryer wrote. */
export function parseDrySnapshot(edn: string): Duplicate[] {
  return Snapshot.parse(readEdn(edn)).candidates;
}

/** Pairs with both sides in production code, apart from the pairs where either side is test code. */
export function splitDuplicates(
  pairs: readonly Duplicate[],
  isTest: (span: Span) => boolean,
): SplitDuplicates {
  const split: SplitDuplicates = { production: [], test: [] };
  for (const pair of pairs) {
    const kind = isTest(pair.left) || isTest(pair.right) ? 'test' : 'production';
    split[kind].push(pair);
  }
  return split;
}

export const spanLabel = (span: Span) => `${span.file}:${span.start}-${span.end}`;

const lineCount = (span: Span) => span.end - span.start + 1;

const weight = (pair: Duplicate) =>
  Math.min(lineCount(pair.left), lineCount(pair.right)) * pair.score;

const byWeight = (a: Duplicate, b: Duplicate) =>
  weight(b) - weight(a) || spanLabel(a.left).localeCompare(spanLabel(b.left));

const byScore = (a: Duplicate, b: Duplicate) =>
  b.score - a.score || spanLabel(a.left).localeCompare(spanLabel(b.left));

const formKey = (span: Span) => `${span.file}:${span.start}`;

function rootOf(parent: ReadonlyMap<string, string>, key: string): string {
  let current = key;
  let next = parent.get(current) ?? current;
  while (next !== current) {
    current = next;
    next = parent.get(current) ?? current;
  }
  return current;
}

function toCluster(forms: ReadonlyMap<string, Span>): Cluster {
  const sorted = [...forms.values()].sort((a, b) => spanLabel(a).localeCompare(spanLabel(b)));
  return { forms: sorted, lines: sorted.reduce((sum, span) => sum + lineCount(span), 0) };
}

/** The forms any chain of pairs joins, one cluster per group, the one with the most forms first. */
export function clusterDuplicates(pairs: readonly Duplicate[]): Cluster[] {
  const parent = new Map<string, string>();
  for (const pair of pairs) {
    parent.set(rootOf(parent, formKey(pair.left)), rootOf(parent, formKey(pair.right)));
  }
  const groups = new Map<string, Map<string, Span>>();
  for (const span of pairs.flatMap((pair) => [pair.left, pair.right])) {
    const root = rootOf(parent, formKey(span));
    const group = groups.get(root) ?? new Map<string, Span>();
    group.set(spanLabel(span), span);
    groups.set(root, group);
  }
  return [...groups.values()]
    .map(toCluster)
    .sort((a, b) => b.forms.length - a.forms.length || b.lines - a.lines);
}

/** One pair per line, closest first: score, language, left span and right span, tab separated. */
export function duplicateRows(pairs: readonly Duplicate[]): string {
  return [...pairs]
    .sort(byScore)
    .map((pair) =>
      [pair.score.toFixed(2), pair.language, spanLabel(pair.left), spanLabel(pair.right)].join(
        '\t',
      ),
    )
    .map((row) => `${row}\n`)
    .join('');
}

/** What a report says about production duplication, with the `limit` largest pairs and clusters. */
export function summarizeDry(split: SplitDuplicates, limit: number): DrySummary {
  const clusters = clusterDuplicates(split.production);
  return {
    production: split.production.length,
    test: split.test.length,
    exact: split.production.filter((pair) => pair.score >= EXACT).length,
    crossFile: split.production.filter((pair) => pair.left.file !== pair.right.file).length,
    clusters: clusters.length,
    largestClusters: clusters.slice(0, limit),
    largestPairs: [...split.production].sort(byWeight).slice(0, limit),
  };
}
