// Ranked subsequence matching: what a filter box does to a long list of slugs.

const SEPARATORS = new Set(['-', '_', ' ', '.', '/']);

const MATCH = 16;
const BOUNDARY = 10;
const CONSECUTIVE = 12;
const GAP = 1;
const LEAD = 1;

const NONE = Number.NEGATIVE_INFINITY;

/** The query as the matcher reads it: lower-cased, with the separators dropped.
 * Empty means there is nothing to match on, and everything is a hit. */
function fuzzyQuery(query: string): string {
  let out = '';
  for (const char of query.toLowerCase()) {
    if (!SEPARATORS.has(char)) out += char;
  }
  return out;
}

function startsWord(text: string, at: number): boolean {
  return at === 0 || SEPARATORS.has(text[at - 1] as string);
}

function holdsInOrder(text: string, needle: string): boolean {
  let from = 0;
  for (const char of needle) {
    const at = text.indexOf(char, from);
    if (at === -1) return false;
    from = at + 1;
  }
  return true;
}

const faceAt = (text: string, at: number): number => MATCH + (startsWord(text, at) ? BOUNDARY : 0);

// The first letter has nothing behind it, so its only pull is towards the start.
function openRow(text: string, char: string, row: number[]): void {
  for (let at = 0; at < row.length; at += 1) {
    row[at] = text[at] === char ? faceAt(text, at) - LEAD * at : NONE;
  }
}

// Every later letter either carries on the run behind it or pays for the gap.
function nextRow(text: string, char: string, prev: readonly number[], row: number[]): void {
  let gapped = NONE;
  for (let at = 0; at < row.length; at += 1) {
    const earlier = at === 0 ? NONE : (prev[at - 1] as number);
    gapped = at === 0 ? NONE : Math.max(gapped, earlier) - GAP;
    row[at] = text[at] === char ? faceAt(text, at) + Math.max(gapped, earlier + CONSECUTIVE) : NONE;
  }
}

function scoreOf(text: string, needle: string): number {
  const width = text.length;
  let prev = new Array<number>(width).fill(NONE);
  let row = new Array<number>(width).fill(NONE);
  let step = 0;
  for (const char of needle) {
    if (step === 0) openRow(text, char, row);
    else nextRow(text, char, prev, row);
    [prev, row] = [row, prev];
    step += 1;
  }
  return Math.max(...prev);
}

/** How well `query` matches `text`, higher being better, or `null` when the
 * query's letters are not all present in order. Separators in the query are
 * ignored, so `player pause` scores as `playerpause` does. An empty query
 * scores 0 against anything. */
function fuzzyScore(text: string, query: string): number | null {
  const needle = fuzzyQuery(query);
  if (!needle) return 0;
  const hay = text.toLowerCase();
  if (!holdsInOrder(hay, needle)) return null;
  return scoreOf(hay, needle);
}

/** One candidate the query matched, and how well. */
interface FuzzyHit<T extends string> {
  text: T;
  score: number;
}

/** The candidates `query` matches, best first: a contiguous run, a match on a
 * word boundary and a match nearer the start all score higher. A tie goes to
 * the shorter candidate, then to the order given. An empty query returns every
 * candidate in the order given, each scoring 0. */
function fuzzySearch<T extends string>(candidates: readonly T[], query: string): FuzzyHit<T>[] {
  const needle = fuzzyQuery(query);
  if (!needle) return candidates.map((text) => ({ text, score: 0 }));
  const hits: FuzzyHit<T>[] = [];
  for (const candidate of candidates) {
    const hay = candidate.toLowerCase();
    if (holdsInOrder(hay, needle)) hits.push({ text: candidate, score: scoreOf(hay, needle) });
  }
  hits.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
  return hits;
}

export type { FuzzyHit };
export { fuzzyQuery, fuzzyScore, fuzzySearch };
