import type { FunctionScore } from './functions';
import type { Language } from './sources';

export type Measure = 'crap' | 'complexity' | 'lines' | 'parameters' | 'nesting';

export interface Finding {
  function: FunctionScore;
  measure: Measure;
  value: number;
  limit: number;
  inherited: boolean;
}

/**
 * The most a function may measure, in either language: the numbers of
 * `CONVENTIONS.md`, which `.oxlintrc.json` holds for TypeScript.
 */
export const LIMITS: Record<Measure, number> = {
  crap: 10,
  complexity: 8,
  lines: 30,
  parameters: 3,
  nesting: 3,
};

/**
 * What this gate judges per language. The lint already fails a TypeScript
 * function on its sizes, so the gate adds CRAP there and holds every limit
 * for Rust, which has no such lint.
 */
const JUDGED: Record<Language, readonly Measure[]> = {
  typescript: ['crap'],
  rust: ['crap', 'complexity', 'lines', 'parameters', 'nesting'],
};

const over = (measure: Measure, value: number, limit: number) =>
  measure === 'crap' ? value >= limit : value > limit;

type Sized = Exclude<Measure, 'crap'>;

/**
 * A function's value on a size. Complexity leaves out Rust's `?`: crapper
 * counts each as a decision, and a function that only hands errors up is
 * straight-line code.
 */
function sizeOf(measure: Sized, score: FunctionScore): number {
  const value = score[measure] ?? 0;
  return measure === 'complexity' ? value - (score.tries ?? 0) : value;
}

const valueOf = (measure: Measure, score: FunctionScore) =>
  measure === 'crap' ? score.crap : sizeOf(measure, score);

function grew(measure: Measure, now: FunctionScore, before: readonly FunctionScore[]): boolean {
  const size: Sized = measure === 'crap' ? 'complexity' : measure;
  return sizeOf(size, now) > Math.max(...before.map((score) => sizeOf(size, score)));
}

/**
 * Every limit a function is over. A finding is `inherited` when the function
 * was in the base under the same name and did not grow on that measure; a
 * change answers only for a function it adds or makes worse. The base holds no
 * coverage, so CRAP counts as grown when the complexity grew.
 */
export function judge(
  language: Language,
  now: FunctionScore,
  before: readonly FunctionScore[],
): Finding[] {
  const findings: Finding[] = [];
  for (const measure of JUDGED[language]) {
    const value = valueOf(measure, now);
    if (value !== null && over(measure, value, LIMITS[measure])) {
      const inherited = before.length > 0 && !grew(measure, now, before);
      findings.push({ function: now, measure, value, limit: LIMITS[measure], inherited });
    }
  }
  return findings;
}
