// The kit's fast-scroll rail, docked down the right edge of a catalogue grid
// and centred between the safe-area insets. The kit component carries the
// letters, the lens and the scrubbing; this wrapper only decides where it
// lives on a phone.

import { TITLE_LETTERS } from '@kroma/core';
import { Box, type LetterRange, AlphabetRail as Rail, styles } from '@kroma/ui/kit';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';

/** What the grid gives up on its right so no poster runs under the rail. */
export const RAIL_RESERVE = 40;

export function AlphabetRail({
  available,
  range,
  onJump,
}: Readonly<{
  available: ReadonlySet<string>;
  range?: LetterRange;
  onJump: (letter: string) => void;
}>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  // Every letter the finger crosses is felt, as every tab the pill slides over is.
  const jump = (letter: string) => {
    void Haptics.selectionAsync();
    onJump(letter);
  };
  return (
    <Box
      pointerEvents="box-none"
      style={[s.dock, { top: insets.top, bottom: Math.max(insets.bottom, 12) }]}
    >
      <Rail.Root size="sm" label={t('browse.letterNav')} range={range} onJump={jump}>
        {TITLE_LETTERS.map((letter) => (
          <Rail.Item
            key={letter}
            value={letter}
            disabled={!available.has(letter)}
            label={t('browse.jumpToLetter', { letter })}
          />
        ))}
      </Rail.Root>
    </Box>
  );
}

const s = styles({
  dock: { absolute: true, right: 6, justify: 'center', align: 'flex-end' },
});
