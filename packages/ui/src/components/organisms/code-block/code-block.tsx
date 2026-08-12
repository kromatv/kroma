// <CodeBlock>: a block of TSX, highlighted, numbered and copyable.
//
// It paints through <Text> and <Box> rather than through a highlighter, because
// every highlighter worth having emits HTML and there is no HTML on a
// television. The palette is the design's own tokens, written as token NAMES
// resolved at render: the workbench swaps themes at run time, and a colour read
// once keeps the palette it was read under.

import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { CopyButton } from '#ui/components/molecules/copy-button';
import { styles } from '#ui/core';
import { useCopy } from '#ui/lib/use-copy';
import { lines } from './code-tokens';

// `lineHeight` is shared with the gutter, and neither column adds row spacing of
// its own, which is what keeps a number level with its line.
const LINE = { font: 'mono', fontSize: 12.5, lineHeight: 19 } as const;

const ink = styles({
  plain: { ...LINE, color: 'text' },
  tag: { ...LINE, color: 'accent' },
  attr: { ...LINE, color: 'info' },
  string: { ...LINE, color: 'h265' },
  keyword: { ...LINE, color: 'hdr' },
  number: { ...LINE, color: 'h265' },
  brace: { ...LINE, color: 'textDim' },
  comment: { ...LINE, color: 'textDim' },
});

interface CodeBlockProps {
  /** The snippet, trimmed before it is painted. */
  code: string;
  /** Numbers the lines. Defaults to on for anything longer than one line. */
  numbers?: boolean;
  /** The height past which the block scrolls rather than growing. Defaults to
   *  320: a two-line snippet is a two-line block, never a mostly-empty well. */
  maxHeight?: number;
}

/**
 * A block of TSX. Code is never wrapped and never truncated - a broken call site
 * reads as a different call site - so a long line scrolls sideways instead.
 * Which is why the layout is two scrollers rather than one: the line numbers sit
 * OUTSIDE the horizontal one, so they stay put while the code slides under them,
 * and INSIDE the vertical one, so they still travel with their own lines.
 *
 * ```tsx
 * <CodeBlock code={`<Button label="Play" onPress={play} />`} />
 * ```
 */
function CodeBlock({ code, numbers, maxHeight = 320 }: Readonly<CodeBlockProps>) {
  const trimmed = code.trim();
  const rows = useMemo(() => lines(trimmed), [trimmed]);
  const showNumbers = numbers ?? rows.length > 1;
  // No clipboard, no corner: a television has neither one nor anywhere to
  // paste, and the clearance goes with the button that needed it.
  const { available } = useCopy();
  // The gutter is as wide as the LAST line number, so a 100-line snippet does
  // not shove its code sideways one digit at a time.
  const digits = String(rows.length).length;
  return (
    <Box bg="surface2" radius="md" style={[s.frame, { maxHeight }]}>
      {available ? (
        <Box absolute style={s.copySlot}>
          <CopyButton value={trimmed} iconOnly label="Copier le code" />
        </Box>
      ) : null}
      <ScrollView style={s.scrollY} contentContainerStyle={[s.body, available && s.bodyCopy]}>
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
                        <Text key={index} style={ink[token.kind]}>
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
  line: { ...LINE },
  gutter: { font: 'mono', fontSize: 11.5, lineHeight: LINE.lineHeight, opacity: 0.6 },
  copySlot: { top: 6, right: 6, z: 1 },
});

export type { CodeBlockProps };
export { CodeBlock };
