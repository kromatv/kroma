// The TSX lexer behind <CodeBlock>.
//
// It has no schema to validate against and no error state: whatever it fails to
// recognise is painted as plain text, so a construct it does not know degrades
// to uncoloured rather than mangled.

/** What a run of code was recognised as, which is the only thing the painter
 * reads. */
type TokenKind = 'plain' | 'tag' | 'attr' | 'string' | 'keyword' | 'number' | 'brace' | 'comment';

interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'import',
  'export',
  'from',
  'default',
  'if',
  'else',
  'for',
  'of',
  'in',
  'async',
  'await',
  'new',
  'true',
  'false',
  'null',
  'undefined',
  'type',
  'interface',
]);

// A scanner's name. `word` is not a token kind: it is the fallback identifier
// scanner, whose match becomes `keyword` or `plain` depending on the word.
type ScanKind = TokenKind | 'word';

// One scanner per shape, tried in order at a fixed position (sticky `y`
// regex): comments, strings, a JSX tag name, an attribute name, a number, a
// brace, then any other identifier. Each string pattern is the unrolled form
// (`"[^"\\]*(?:\\.[^"\\]*)*"`), which cannot backtrack quadratically on an
// unterminated string the way `(?:[^"\\]|\\.)*` can. Anything no scanner
// claims falls through as plain text.
const SCANNERS: readonly (readonly [ScanKind, RegExp])[] = [
  ['comment', /\/\/[^\n]*/y],
  ['comment', /\/\*[\s\S]*?\*\//y],
  ['string', /"[^"\\]*(?:\\.[^"\\]*)*"/y],
  ['string', /'[^'\\]*(?:\\.[^'\\]*)*'/y],
  ['string', /`[^`\\]*(?:\\.[^`\\]*)*`/y],
  ['tag', /<\/?[A-Z][\w.]*/y],
  ['tag', /<\/?[a-z][\w.]*(?=[\s/>])/y],
  ['attr', /[A-Za-z_$][\w$]*(?=\s*=[^=])/y],
  ['number', /\d+(?:\.\d+)?\b/y],
  ['brace', /[{}[\]()]/y],
  ['word', /[A-Za-z_$][\w$]*/y],
];

// `word` is the fallback identifier scanner: whether its match is a keyword is
// the only thing the scanner list cannot say for itself.
function kindOf(scanner: ScanKind, text: string): TokenKind {
  if (scanner !== 'word') return scanner;
  return KEYWORDS.has(text) ? 'keyword' : 'plain';
}

function scanAt(code: string, from: number): Token | null {
  for (const [kind, pattern] of SCANNERS) {
    pattern.lastIndex = from;
    const hit = pattern.exec(code);
    if (!hit?.[0]) continue;
    return { text: hit[0], kind: kindOf(kind, hit[0]) };
  }
  return null;
}

/** Every character of `code`, in order and with nothing lost: the tokens
 * concatenate back to the input. */
function tokenize(code: string): Token[] {
  const out: Token[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ text: plain, kind: 'plain' });
    plain = '';
  };

  let at = 0;
  while (at < code.length) {
    const hit = scanAt(code, at);
    if (!hit) {
      plain += code[at];
      at += 1;
      continue;
    }
    // A `word` that turned out to be plain merges with the run around it, so
    // the output has no gratuitous seams in it.
    if (hit.kind === 'plain') {
      plain += hit.text;
    } else {
      flush();
      out.push(hit);
    }
    at += hit.text.length;
  }
  flush();
  return out;
}

/** The tokens regrouped per line, so a line number can sit beside each one
 * without the colouring having to survive a wrapping layout. */
function lines(code: string): Token[][] {
  const out: Token[][] = [[]];
  for (const token of tokenize(code)) {
    const parts = token.text.split('\n');
    parts.forEach((part, at) => {
      if (at > 0) out.push([]);
      if (part) out.at(-1)?.push({ text: part, kind: token.kind });
    });
  }
  return out;
}

export type { Token, TokenKind };
export { lines, tokenize };
