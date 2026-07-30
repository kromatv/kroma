// A small TSX syntax highlighter and code block: renders via <Txt>/<Box> so
// it works on web and Apple TV without an HTML-emitting dependency.

import { Box, Icon, IconButton, type IconName, Txt } from '@kroma/ui/kit';
import { type ColorToken, colors, radius } from '@kroma/ui/tokens';
import { useCallback, useMemo } from 'react';
import { Platform, ScrollView } from 'react-native';
import { type CopyState, useCopy } from './clipboard';

type TokenKind = 'plain' | 'tag' | 'attr' | 'string' | 'keyword' | 'number' | 'brace' | 'comment';

interface Token {
  text: string;
  kind: TokenKind;
}

// The palette, from the design's own tokens: no imported highlighter theme,
// and every colour here is one the rest of the app already paints with.
const INK: Record<TokenKind, string> = {
  plain: colors.text,
  tag: colors.accent,
  attr: colors.info,
  string: colors.h265,
  keyword: colors.hdr,
  number: colors.h265,
  brace: colors.textDim,
  comment: colors.textDim,
};

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
// claims falls through as plain text, so an unsupported construct degrades to
// uncoloured rather than mangled.
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

// `word` is the fallback identifier scanner: whether its match is a keyword
// is the only thing the scanner list cannot say for itself.
function kindOf(scanner: ScanKind, text: string): TokenKind {
  if (scanner !== 'word') return scanner;
  return KEYWORDS.has(text) ? 'keyword' : 'plain';
}

function scanAt(code: string, from: number): { text: string; kind: TokenKind } | null {
  for (const [kind, pattern] of SCANNERS) {
    pattern.lastIndex = from;
    const hit = pattern.exec(code);
    if (!hit?.[0]) continue;
    return { text: hit[0], kind: kindOf(kind, hit[0]) };
  }
  return null;
}

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

// Tokens regrouped per line, so a line number can sit beside each one without the colouring
// having to survive a wrapping layout.
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

// The platform's own monospace: the kit ships no mono family, and code blocks
// in a workbench do not justify bundling one.
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

interface CodeBlockProps {
  code: string;
  numbers?: boolean;
  // Web only: there is no clipboard to write to on a television, and nothing
  // to paste into either.
  copy?: boolean;
  maxHeight?: number;
}

// A block of TSX: highlighted, optionally numbered, optionally copyable. Code is never wrapped
// and never truncated - a broken call site reads as a different call site - so a long line
// scrolls sideways instead. Which is why the layout is two scrollers rather than one: the line
// numbers sit OUTSIDE the horizontal one, so they stay put while the code slides under them,
// and INSIDE the vertical one, so they still travel with their own lines. The block hugs its
// content up to `maxHeight`; only past that does it scroll, so a two-line snippet is a two-line
// block rather than a mostly-empty well.
function CodeBlock({ code, numbers, copy = true, maxHeight = 320 }: Readonly<CodeBlockProps>) {
  const trimmed = code.trim();
  const rows = useMemo(() => lines(trimmed), [trimmed]);
  const showNumbers = numbers ?? rows.length > 1;
  // The gutter is as wide as the LAST line number, so a 100-line snippet does
  // not shove its code sideways one digit at a time.
  const digits = String(rows.length).length;
  return (
    <Box bg="surface2" radius="md" style={[FRAME, { maxHeight }]}>
      {copy ? <CopyButton code={trimmed} /> : null}
      <ScrollView style={SCROLL_Y} contentContainerStyle={[BODY, copy && BODY_COPY]}>
        <Box row>
          {showNumbers ? (
            <Box style={GUTTER_COL}>
              {rows.map((_, at) => (
                // Line order is fixed for a given snippet, so the index IS the
                // identity.
                // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                <Txt key={at} style={GUTTER} color="textDim">
                  {String(at + 1).padStart(digits, ' ')}
                </Txt>
              ))}
            </Box>
          ) : null}
          <ScrollView horizontal style={SCROLL_X} contentContainerStyle={CODE_COL}>
            {/* One column sized to the LONGEST line: every shorter line then
                fits inside it untouched, which is what keeps them unwrapped
                without a web-only `white-space` override. */}
            <Box style={CODE_LINES}>
              {rows.map((row, at) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                <Txt key={at} style={LINE}>
                  {row.length === 0
                    ? ' '
                    : row.map((token, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                        <Txt key={index} style={INK_STYLE[token.kind]}>
                          {token.text}
                        </Txt>
                      ))}
                </Txt>
              ))}
            </Box>
          </ScrollView>
        </Box>
      </ScrollView>
    </Box>
  );
}

// Copy to the clipboard, where there is one. The confirmation is the icon
// itself turning into a tick, so the button never changes width.
function CopyButton({ code }: Readonly<{ code: string }>) {
  const { available, state, copy } = useCopy();
  const onPress = useCallback(() => copy(code), [copy, code]);

  // No clipboard, no button: a disabled affordance on a television is worse
  // than no affordance at all.
  if (!available) return null;

  return (
    <Box absolute style={COPY_SLOT}>
      <IconButton
        variant="ghost"
        size={COPY_BOX}
        radius={radius.sm}
        label={COPY_LABEL[state]}
        ring={false}
        focusScale={1}
        focusedStyle={COPY_FOCUS}
        onPress={onPress}
      >
        {/* The stateful glyph rides in as a child: the confirmation is the icon
            itself turning into a tick, in its own ink. */}
        <Icon name={COPY_GLYPH[state]} size={15} color={COPY_INK[state]} />
      </IconButton>
    </Box>
  );
}

const FRAME = { borderWidth: 1, borderColor: colors.border, overflow: 'hidden' } as const;
// Hug the content: the cap lives on the frame's maxHeight, and a ScrollView that
// grows would stretch a two-line snippet to fill it.
const SCROLL_Y = { flexGrow: 0 } as const;
// The sideways scroller, by contrast, must be CLAMPED to the width left beside
// the gutter - that clamp is what it scrolls within. `minWidth: 0` is what lets
// a flex child shrink under its (very wide) content on the web targets.
const SCROLL_X = { flex: 1, minWidth: 0 } as const;
const BODY = { padding: 14 } as const;
// Fill the scroller when the code is narrower than the frame.
const CODE_COL = { flexGrow: 1 } as const;
// Clearance for the copy button floating over the top-right corner.
const BODY_COPY = { paddingRight: 44 } as const;
// The gutter is a fixed column, so the separator is what tells you the numbers
// are parked rather than scrolled off with the code.
const GUTTER_COL = {
  paddingRight: 12,
  marginRight: 12,
  borderRightWidth: 1,
  borderRightColor: colors.border,
} as const;
// Never shrink to the frame: shrinking is what would re-wrap the long lines.
const CODE_LINES = { flexShrink: 0 } as const;
// `lineHeight` is shared with GUTTER, and neither column adds row spacing of its
// own, which is what keeps a number level with its line.
const LINE = { fontFamily: MONO, fontSize: 12.5, lineHeight: 19 } as const;
// One style array per token KIND, built once: a hundred-line snippet is
// ~1500 spans, and `CodeBlock` re-renders on any shell state change (a
// slider drag is one per frame), so building those arrays inline costs
// thousands of allocations and as many styleq cache misses per unrelated
// state change.
const INK_STYLE = Object.fromEntries(
  Object.entries(INK).map(([kind, color]) => [kind, [LINE, { color }]]),
) as Record<TokenKind, [typeof LINE, { color: string }]>;
const GUTTER = {
  fontFamily: MONO,
  fontSize: 11.5,
  lineHeight: 19,
  opacity: 0.6,
} as const;
const COPY_SLOT = { top: 6, right: 6, zIndex: 1 } as const;
// The box around the 15pt glyph.
const COPY_BOX = 29;
// A notch up from the chrome's FOCUS_WASH: the button floats over a lifted
// surface, where the plain wash reads as nothing at all.
const COPY_FOCUS = { backgroundColor: 'rgba(255, 255, 255, 0.08)' } as const;
// Indexed rather than nested ternaries: three states, three lookups, and the
// failure is SAID rather than left looking like the press did nothing.
const COPY_LABEL: Record<CopyState, string> = {
  idle: 'Copy code',
  copied: 'Copied',
  failed: 'Could not copy',
};
const COPY_GLYPH: Record<CopyState, IconName> = {
  idle: 'copy',
  copied: 'check',
  failed: 'alert-triangle',
};
const COPY_INK: Record<CopyState, ColorToken> = {
  idle: 'textDim',
  copied: 'success',
  failed: 'danger',
};

export type { CodeBlockProps, Token, TokenKind };
export { CodeBlock, lines, MONO, tokenize };
