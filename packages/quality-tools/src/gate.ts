import { type ChangedFile, touches } from './changes';
import type { Duplicate, Span } from './dry';
import { byFile } from './functions';
import { type Finding, type FunctionScore, judge } from './limits';
import { languageOf } from './sources';

export interface Measurements {
  changes: readonly ChangedFile[];
  now: readonly FunctionScore[];
  before: readonly FunctionScore[];
}

export interface DuplicateFinding {
  pair: Duplicate;
  inherited: boolean;
}

const namesakes = (before: readonly FunctionScore[] | undefined, name: string) =>
  (before ?? []).filter((score) => score.name === name);

/**
 * What the functions a change touched are over, worst kept apart from
 * inherited: a function is judged when the change adds or rewrites a line of
 * it, against the function of the same name in the base version of its file.
 */
export function limitFindings({ changes, now, before }: Measurements): Finding[] {
  const current = byFile(now);
  const base = byFile(before);
  const findings: Finding[] = [];
  for (const change of changes) {
    const language = languageOf(change.file);
    if (language === undefined) {
      continue;
    }
    for (const scored of current.get(change.file) ?? []) {
      if (touches(change, scored)) {
        const earlier = namesakes(base.get(change.file), scored.name);
        findings.push(...judge(language, scored, earlier));
      }
    }
  }
  return findings;
}

type Side = 'untouched' | 'inherited' | 'new';

const overlap = (score: FunctionScore, span: Span) =>
  score.start <= span.end && score.end >= span.start;

function sideOf(span: Span, { changes, now, before }: Measurements): Side {
  const change = changes.find((candidate) => candidate.file === span.file);
  if (change === undefined || !touches(change, span)) {
    return 'untouched';
  }
  const inBase = before.filter((score) => score.file === span.file);
  const touched = now.filter(
    (score) => score.file === span.file && touches(change, score) && overlap(score, span),
  );
  const added = change.added || touched.some((score) => namesakes(inBase, score.name).length === 0);
  return added ? 'new' : 'inherited';
}

/**
 * The production pairs a change is part of. A pair is new when one of its
 * sides is code the change adds: a new file, or a function the base did not
 * hold. A pair that only has a rewritten older function on a side is
 * inherited.
 */
export function duplicateFindings(
  pairs: readonly Duplicate[],
  measured: Measurements,
): DuplicateFinding[] {
  const findings: DuplicateFinding[] = [];
  for (const pair of pairs) {
    const sides = new Set([sideOf(pair.left, measured), sideOf(pair.right, measured)]);
    if (sides.has('new')) {
      findings.push({ pair, inherited: false });
    } else if (sides.has('inherited')) {
      findings.push({ pair, inherited: true });
    }
  }
  return findings;
}
