import type { StyleProp, TextStyle } from 'react-native';
import type { ColorToken } from '#ui/lib/tokens';
// <Hint>: the row that tells you what the remote does. Translations carry only
// the words and a `{left}`-style token where a key belongs; the tokens become
// kit icons, because tvOS renders the geometric arrow code points with emoji
// presentation when they are written as literal text.

import type { ReactNode } from 'react';
import { Box, type BoxProps } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';

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
  size?: number;
  color?: ColorToken | (string & {});
  textStyle?: StyleProp<TextStyle>;
}

function Hint({ text, size = 15, color = 'textDim', textStyle, ...box }: Readonly<HintProps>) {
  const parts: ReactNode[] = [];
  let at = 0;
  // `TOKEN` is global and shared: without the reset it keeps its lastIndex and
  // starts mid-string on the next render.
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
