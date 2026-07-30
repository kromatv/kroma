// Paraglide messages are plain STRINGS, which is the right trade for translation
// (a `.json` a translator or a TMS can open) but leaves nowhere to put the little
// bits of markup the copy genuinely needs: the two amber words in a heading, a
// codec name set in mono, an OS name pulled to full-strength text.
//
// So markup travels as three markers inside the string, and this module is the one
// place that knows them. Deliberately NOT a markdown subset: three markers are
// enough for UI copy, they are obvious to a translator who has never seen the
// codebase, and a stray bracket in prose cannot break a page. Long-form prose (the
// privacy policy) is not written this way at all - it is MDX per locale, where
// real markdown and real links belong.
//
//   [amber]     the brand accent, for the emphasised words of a heading
//   `mono`      inline code: a command, a codec, a filename, an env var
//   *bright*    lifted to full-strength text, for an OS or product name in prose
//
// A marker that is not closed is returned as literal text rather than throwing:
// a translator's typo should mean one odd-looking word, never a blank page.

export type RichToken =
  | { kind: 'text'; value: string }
  | { kind: 'accent'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'bright'; value: string };

const PATTERNS: ReadonlyArray<{ open: string; close: string; kind: RichToken['kind'] }> = [
  { open: '[', close: ']', kind: 'accent' },
  { open: '`', close: '`', kind: 'code' },
  { open: '*', close: '*', kind: 'bright' },
];

/**
 * Split a message into styled runs. Pure, so it is unit-tested directly and can
 * run during the prerender with no DOM.
 */
export function parseRich(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  let plain = '';

  const flush = () => {
    if (plain) {
      tokens.push({ kind: 'text', value: plain });
      plain = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    const pattern = PATTERNS.find((p) => p.open === char);

    if (pattern) {
      const end = text.indexOf(pattern.close, i + 1);
      // An unclosed marker is literal text, not an error.
      if (end > i + 1) {
        flush();
        tokens.push({ kind: pattern.kind, value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    plain += char;
    i += 1;
  }

  flush();
  return tokens;
}

/** The message with every marker stripped, for an `alt`, a `title` or any other
 *  place that takes a plain string and cannot render runs. */
export function plainRich(text: string): string {
  return parseRich(text)
    .map((t) => t.value)
    .join('');
}
