import type { StyleProp, TextStyle } from 'react-native';
import type { ColorToken } from '#ui/lib/tokens';
// <Hint>: the row that tells you what the remote does.
//
// These lines used to be written with the geometric characters as literal text
// inside the translations: "◀ ▶ Naviguer · OK Sélectionner". That is wrong twice
// over. tvOS renders several of those code points with EMOJI presentation, so
// the app showed blue arrow emoji instead of design glyphs. And it put a piece
// of the interface inside a string a translator is expected to edit.
//
// So the translations keep only the words, with a token where a key belongs:
//
//   "profiles.navHint": "{left} {right} Naviguer · OK Sélectionner"
//
// and the tokens become real icons from the kit's own set, at the text's size
// and colour. Word order stays with the translator, where it belongs.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';

/** The keys a hint can name, and the glyph each one draws. */
const KEYS = {
  left: 'chevron-left',
  right: 'chevron-right',
  up: 'chevron-up',
  down: 'chevron-down',
  back: 'backspace',
  play: 'player-play-filled',
  pause: 'player-pause-filled',
} as const satisfies Record<string, IconName>;

type HintKey = keyof typeof KEYS;

const TOKEN = /\{(left|right|up|down|back|play|pause)\}/g;

interface HintProps extends Omit<BoxProps, 'children'> {
  /** The translated line, with `{left}`-style tokens where keys belong. */
  text: string;
  /** Glyph and text size. Hints are secondary, so this is small by default. */
  size?: number;
  color?: ColorToken | (string & {});
  /** Extra style for the WORDS. `style` stays with <Box>, as on every other
   * component, so a caller can lay the row out and tune its type separately. */
  textStyle?: StyleProp<TextStyle>;
}

function Hint({ text, size = 15, color = 'textDim', textStyle, ...box }: Readonly<HintProps>) {
  const parts: ReactNode[] = [];
  let at = 0;
  // `TOKEN` is global, so reset it: a shared regex keeps its lastIndex between
  // calls and would otherwise start mid-string on the second render.
  TOKEN.lastIndex = 0;
  let match = TOKEN.exec(text);
  while (match) {
    if (match.index > at) parts.push(text.slice(at, match.index));
    parts.push(match[1] as HintKey);
    at = match.index + match[0].length;
    match = TOKEN.exec(text);
  }
  if (at < text.length) parts.push(text.slice(at));

  return (
    <Box row align="center" {...box}>
      {parts.map((part, index) =>
        typeof part === 'string' && !(part in KEYS) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one line are a fixed, ordered split; there is no stable id to key on.
          <Txt key={index} color={color} style={[{ fontSize: size }, textStyle]}>
            {part}
          </Txt>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: same fixed split.
          <Icon key={index} name={KEYS[part as HintKey]} size={size + 3} color={color} />
        ),
      )}
    </Box>
  );
}

export type { HintKey, HintProps };
export { Hint, KEYS as HINT_KEYS };
