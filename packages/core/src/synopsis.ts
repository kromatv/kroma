import { SUPPORTED_LOCALES, translate } from './i18n';

const ABBREVIATIONS = 'vocab.abbreviations';

function abbreviations(): Set<string> {
  const known = new Set<string>();
  for (const locale of SUPPORTED_LOCALES) {
    const copy = translate(locale, ABBREVIATIONS);
    if (copy === ABBREVIATIONS) {
      continue;
    }
    for (const word of copy.split(',')) {
      known.add(word.trim().toLowerCase());
    }
  }
  return known;
}

const COMBINING_MARK = /[\u0300-\u036f]/;

function isLetter(char: string): boolean {
  return char.toLowerCase() !== char.toUpperCase() || COMBINING_MARK.test(char);
}

function lastWord(text: string): string {
  const letters = [...text];
  let from = letters.length;
  while (from > 0 && isLetter(letters[from - 1] ?? '')) {
    from -= 1;
  }
  return letters.slice(from).join('');
}

function endsOnAbbreviation(sentence: string, known: Set<string>): boolean {
  const word = lastWord(sentence);
  if (!word) {
    return false;
  }
  return (word.length === 1 && word === word.toUpperCase()) || known.has(word.toLowerCase());
}

const LATIN_STOPS = '.!?…';
const WIDE_STOPS = '。！？';
const CLOSERS = '"\'”»)]」』';
const SPACE = /\s/;

function endOfSentence(text: string, at: number): number {
  const wide = WIDE_STOPS.includes(text[at] ?? '');
  const stops = wide ? WIDE_STOPS : LATIN_STOPS;
  let end = at;
  while (end < text.length && stops.includes(text[end] ?? '')) {
    end += 1;
  }
  while (end < text.length && CLOSERS.includes(text[end] ?? '')) {
    end += 1;
  }
  const followed = end < text.length && SPACE.test(text[end] ?? '');
  return wide || followed ? end : -1;
}

function byPunctuation(text: string): string[] {
  const known = abbreviations();
  const sentences: string[] = [];
  let from = 0;
  let at = 0;
  while (at < text.length) {
    const stop = text[at] ?? '';
    const end =
      LATIN_STOPS.includes(stop) || WIDE_STOPS.includes(stop) ? endOfSentence(text, at) : -1;
    const abbreviated = stop === '.' && endsOnAbbreviation(text.slice(from, at), known);
    if (end === -1 || abbreviated) {
      at += 1;
      continue;
    }
    sentences.push(text.slice(from, end).trim());
    from = end;
    at = end;
  }
  const rest = text.slice(from).trim();
  if (rest) {
    sentences.push(rest);
  }
  return sentences;
}

interface SentenceSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}

type SegmenterHost = {
  Segmenter?: new (
    locale: string | undefined,
    options: { granularity: 'sentence' },
  ) => SentenceSegmenter;
};

function sentencesOf(text: string, locale?: string): string[] {
  const { Segmenter } = Intl as unknown as SegmenterHost;
  if (!Segmenter) {
    return byPunctuation(text);
  }
  const sentences: string[] = [];
  for (const { segment } of new Segmenter(locale, { granularity: 'sentence' }).segment(text)) {
    const sentence = segment.trim();
    if (sentence) {
      sentences.push(sentence);
    }
  }
  return sentences;
}

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿가-힣豈-﫿＀-｠]/gu;

function widthOf(text: string): number {
  return text.length + (text.match(WIDE)?.length ?? 0);
}

/**
 * The opening of `synopsis` in whole sentences: as many as fit in `budget`
 * Latin characters, and always the first one, however long it is. Never cut
 * inside a sentence, so it needs no ellipsis and no line clamp. `locale` is the
 * language the synopsis is written in; empty for no synopsis.
 */
export function synopsisLead(
  synopsis: string | null | undefined,
  budget: number,
  locale?: string,
): string {
  const text = (synopsis ?? '').replace(/\s+/g, ' ').trim();
  if (widthOf(text) <= budget) {
    return text;
  }
  const [first = '', ...more] = sentencesOf(text, locale);
  let lead = first;
  for (const sentence of more) {
    const joined = `${lead} ${sentence}`;
    if (widthOf(joined) > budget) {
      break;
    }
    lead = joined;
  }
  return lead;
}
