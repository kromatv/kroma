// A small TSX syntax highlighter and code block: renders via <Text>/<Box> so
// it works on web and Apple TV without an HTML-emitting dependency.

import { Box, Icon, IconButton, type IconName, styles, Text } from '@kroma/ui/kit';
import { type ColorToken, colors } from '@kroma/ui/tokens';
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
    <Box bg="surface2" radius="md" style={[s.frame, { maxHeight }]}>
      {copy ? <CopyButton code={trimmed} /> : null}
      <ScrollView style={s.scrollY} contentContainerStyle={[s.body, copy && s.bodyCopy]}>
        <Box row>
          {showNumbers ? (
            <Box style={s.gutterCol}>
              {rows.map((_, at) => (
                // Line order is fixed for a given snippet, so the index IS the
                // identity.
                // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                <Text key={at} style={s.gutter} color="textDim">
                  {String(at + 1).padStart(digits, ' ')}
                </Text>
              ))}
            </Box>
          ) : null}
          <ScrollView horizontal style={s.scrollX} contentContainerStyle={s.codeCol}>
            {/* One column sized to the LONGEST line: every shorter line then
                fits inside it untouched, which is what keeps them unwrapped
                without a web-only `white-space` override. */}
            <Box style={s.codeLines}>
              {rows.map((row, at) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                <Text key={at} style={s.line}>
                  {row.length === 0
                    ? ' '
                    : row.map((token, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                        <Text key={index} style={INK_STYLE[token.kind]}>
                          {token.text}
                        </Text>
                      ))}
                </Text>
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
    <Box absolute style={s.copySlot}>
      <IconButton
        variant="ghost"
        size={COPY_BOX}
        radius="sm"
        label={COPY_FACE[state].label}
        ring={false}
        focusScale={1}
        states={COPY_STATES}
        onPress={onPress}
      >
        {/* The stateful glyph rides in as a child: the confirmation is the icon
            itself turning into a tick, in its own ink. */}
        <Icon name={COPY_FACE[state].glyph} size={15} color={COPY_FACE[state].ink} />
      </IconButton>
    </Box>
  );
}

const s = styles({
  frame: { border: 'border', overflow: 'hidden' },
  // Hug the content: the cap lives on the frame's maxHeight, and a ScrollView
  // that grows would stretch a two-line snippet to fill it.
  scrollY: { grow: 0 },
  // The sideways scroller, by contrast, must be CLAMPED to the width left
  // beside the gutter - that clamp is what it scrolls within. `minW: 0` is what
  // lets a flex child shrink under its (very wide) content on the web targets.
  scrollX: { flex: true, minW: 0 },
  body: { p: 14 },
  // Fill the scroller when the code is narrower than the frame.
  codeCol: { grow: 1 },
  // Clearance for the copy button floating over the top-right corner.
  bodyCopy: { pr: 44 },
  // The gutter is a fixed column, so the separator is what tells you the
  // numbers are parked rather than scrolled off with the code.
  gutterCol: { pr: 12, mr: 12, borderRightWidth: 1, borderRightColor: 'border' },
  // Never shrink to the frame: shrinking is what would re-wrap the long lines.
  codeLines: { shrink: 0 },
  // `lineHeight` is shared with `gutter`, and neither column adds row spacing of
  // its own, which is what keeps a number level with its line.
  line: { fontFamily: MONO, fontSize: 12.5, lineHeight: 19 },
  gutter: { fontFamily: MONO, fontSize: 11.5, lineHeight: 19, opacity: 0.6 },
  copySlot: { top: 6, right: 6, z: 1 },
});
// One style array per token KIND, built once: a hundred-line snippet is
// ~1500 spans, and `CodeBlock` re-renders on any shell state change (a
// slider drag is one per frame), so building those arrays inline costs
// thousands of allocations and as many styleq cache misses per unrelated
// state change.
const INK_STYLE = Object.fromEntries(
  Object.entries(INK).map(([kind, color]) => [kind, [s.line, { color }]]),
) as Record<TokenKind, [typeof s.line, { color: string }]>;
// The box around the 15pt glyph.
const COPY_BOX = 29;
// A notch up from the ghost variant's own focus wash: this button floats over a
// lifted surface, where that wash reads as nothing at all.
const COPY_STATES = { focus: { bg: 'white/8' } } as const;
// Indexed rather than nested ternaries: three states, one lookup, and the
// failure is SAID rather than left looking like the press did nothing.
const COPY_FACE: Record<CopyState, { label: string; glyph: IconName; ink: ColorToken }> = {
  idle: { label: 'Copy code', glyph: 'copy', ink: 'textDim' },
  copied: { label: 'Copied', glyph: 'check', ink: 'success' },
  failed: { label: 'Could not copy', glyph: 'alert-triangle', ink: 'danger' },
};

export type { CodeBlockProps, Token, TokenKind };
export { CodeBlock, lines, MONO, tokenize };
