const SEPARATOR = /[\s\-_./:,;'’·()[\]+&]/;
const MARKS = /[\u0300-\u036f]/g;

const WHOLE_TEXT = 320;
const TEXT_PREFIX = 240;
const WHOLE_WORD = 170;
const WORD_PREFIX = 130;
const INITIALS = 105;
const INSIDE = 70;
const TYPO = 50;
const TYPO_STEP = 10;
const SCATTERED = 20;
const COVERAGE = 12;
const OUT_OF_ORDER = 6;
const STILL_TYPING = 5;
const SHORTEST_SCATTER = 3;
const WIDEST_SCATTER = 3;

/** How well a query answered a text, and which characters of the text it found. */
interface TextMatch {
  score: number;
  ranges: readonly (readonly [number, number])[];
}

/** One stretch of a text, and whether the query found it. */
interface TextRun {
  text: string;
  hit: boolean;
  at: number;
}

interface TextMatchOptions {
  strict?: boolean;
}

interface Word {
  text: string;
  start: number;
}

interface Found {
  score: number;
  ranges: (readonly [number, number])[];
}

function fold(char: string): string {
  return char.normalize('NFD').replace(MARKS, '').toLowerCase();
}

const isCapital = (char: string) => char !== char.toLowerCase();

function wordsOf(chars: readonly string[], folded: readonly string[]): Word[] {
  const words: Word[] = [];
  let text = '';
  let start = 0;
  const flush = () => {
    if (text) words.push({ text, start });
    text = '';
  };
  chars.forEach((char, at) => {
    if (SEPARATOR.test(char)) return flush();
    if (isCapital(char) && !isCapital(chars[at - 1] ?? 'A')) flush();
    if (!text) start = at;
    text += folded[at] ?? '';
  });
  flush();
  return words;
}

/** The words of a query as the matcher reads them: lower-cased, with no accents. */
function queryTerms(query: string): string[] {
  return Array.from(query, fold).join('').split(new RegExp(SEPARATOR, 'g')).filter(Boolean);
}

function editDistance(a: string, b: string): number {
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (row[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (before[j - 2] as number) + 1);
      }
      row.push(best);
    }
    before = previous;
    previous = row;
  }
  return previous[b.length] as number;
}

function typoBudget(term: string): number {
  if (term.length < 4) return 0;
  return term.length <= 8 ? 1 : 2;
}

function onWord(term: string, word: Word): Found | null {
  const end = word.start + word.text.length;
  if (word.text === term) return { score: WHOLE_WORD, ranges: [[word.start, end]] };
  if (word.text.startsWith(term)) {
    const share = term.length / word.text.length;
    return {
      score: WORD_PREFIX + COVERAGE * share,
      ranges: [[word.start, word.start + term.length]],
    };
  }
  const inside = word.text.indexOf(term);
  if (inside > 0 && term.length > 1) {
    return {
      score: INSIDE,
      ranges: [[word.start + inside, word.start + inside + term.length]],
    };
  }
  const budget = typoBudget(term);
  if (budget === 0 || !word.text.startsWith(term.charAt(0))) return null;
  const distance =
    term.length < STILL_TYPING
      ? editDistance(term, word.text)
      : Math.min(
          editDistance(term, word.text),
          editDistance(term, word.text.slice(0, term.length)),
        );
  if (distance > budget) return null;
  return { score: TYPO - TYPO_STEP * (distance - 1), ranges: [[word.start, end]] };
}

function onWords(terms: readonly string[], words: readonly Word[]): Found | null {
  const used = new Set<Word>();
  const ranges: (readonly [number, number])[] = [];
  let score = 0;
  let last = -1;
  let inOrder = true;
  for (const term of terms) {
    let best: { found: Found; word: Word } | null = null;
    for (const word of words) {
      if (used.has(word)) continue;
      const found = onWord(term, word);
      if (found && (!best || found.score > best.found.score)) best = { found, word };
    }
    if (!best) return null;
    used.add(best.word);
    if (best.word.start < last) inOrder = false;
    last = best.word.start;
    score += best.found.score;
    ranges.push(...best.found.ranges);
  }
  return { score: score / terms.length - (inOrder ? 0 : OUT_OF_ORDER), ranges };
}

function onInitials(needle: string, words: readonly Word[]): Found | null {
  if (needle.length < 2 || words.length < needle.length) return null;
  const ranges: (readonly [number, number])[] = [];
  let at = 0;
  for (const word of words) {
    if (word.text.startsWith(needle.charAt(at))) {
      ranges.push([word.start, word.start + 1]);
      at += 1;
      if (at === needle.length) return { score: INITIALS, ranges };
    }
  }
  return null;
}

function onCompact(
  needle: string,
  chars: readonly string[],
  folded: readonly string[],
): Found | null {
  const kept: number[] = [];
  chars.forEach((char, at) => {
    if (!SEPARATOR.test(char)) kept.push(at);
  });
  const compact = kept.map((at) => folded[at] ?? '').join('');
  const index = compact.indexOf(needle);
  if (index < 0) return null;
  const from = kept[index] as number;
  const to = (kept[index + needle.length - 1] as number) + 1;
  if (compact === needle) return { score: WHOLE_TEXT, ranges: [[from, to]] };
  if (index === 0) return { score: TEXT_PREFIX, ranges: [[from, to]] };
  return { score: INSIDE, ranges: [[from, to]] };
}

function onScattered(
  needle: string,
  folded: readonly string[],
  words: readonly Word[],
): Found | null {
  if (needle.length < SHORTEST_SCATTER) return null;
  let best: Found | null = null;
  for (const word of words) {
    if (!word.text.startsWith(needle.charAt(0))) continue;
    const hits: number[] = [word.start];
    let from = word.start + 1;
    for (const char of needle.slice(1)) {
      const at = folded.indexOf(char, from);
      if (at < 0) break;
      hits.push(at);
      from = at + 1;
    }
    if (hits.length < needle.length) continue;
    const span = (hits.at(-1) as number) - word.start + 1;
    if (span > needle.length * WIDEST_SCATTER) continue;
    const score = SCATTERED + COVERAGE * (needle.length / span);
    if (!best || score > best.score) best = { score, ranges: hits.map((at) => [at, at + 1]) };
  }
  return best;
}

function merged(ranges: readonly (readonly [number, number])[]): (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/**
 * How well `query` answers `text`, or `null` when it does not, tried from the strongest
 * reading to the weakest: the whole text, then every word of the query landing on a word
 * in any order, by whole word, by prefix, inside one, or with a typo, then initials, then
 * the query run together across separators, then scattered letters. Case and accents are
 * ignored throughout. An empty query answers anything, with a score of 0.
 */
function matchText(
  text: string,
  query: string,
  { strict = false }: TextMatchOptions = {},
): TextMatch | null {
  const terms = queryTerms(query);
  if (terms.length === 0) return { score: 0, ranges: [] };
  const chars = Array.from(text);
  const folded = chars.map(fold);
  const words = wordsOf(chars, folded);
  const needle = terms.join('');
  const compact = onCompact(needle, chars, folded);
  const found =
    (compact && compact.score >= TEXT_PREFIX ? compact : null) ??
    onWords(terms, words) ??
    (strict ? null : onInitials(needle, words)) ??
    compact ??
    (strict ? null : onScattered(needle, folded, words));
  if (!found) return null;
  const share = Math.min(1, needle.length / Math.max(1, chars.length));
  return { score: found.score + COVERAGE * share, ranges: merged(found.ranges) };
}

/** `text` cut into what a match found and what lies between, for drawing the match. */
function textRuns(text: string, match: TextMatch | null): TextRun[] {
  const chars = Array.from(text);
  const runs: TextRun[] = [];
  let at = 0;
  for (const [from, to] of match?.ranges ?? []) {
    if (from > at) runs.push({ text: chars.slice(at, from).join(''), hit: false, at });
    runs.push({ text: chars.slice(from, to).join(''), hit: true, at: from });
    at = to;
  }
  if (at < chars.length) runs.push({ text: chars.slice(at).join(''), hit: false, at });
  return runs;
}

export type { TextMatch, TextMatchOptions, TextRun };
export { matchText, queryTerms, textRuns };
