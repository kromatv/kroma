import { Box, Hint, styles } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

const OVERSCAN_BOTTOM = 54;
const HINT_SIZE = 13;

type RemoteKeys = '{left}{right}' | '{up}{down}' | '{back}';

const s = styles({
  hint: { fontSize: HINT_SIZE, fontWeight: '600' },
});

export function HintStrip({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box
      absolute
      left={64}
      bottom={OVERSCAN_BOTTOM}
      row
      align="center"
      gap={30}
      pointerEvents="none"
    >
      {children}
    </Box>
  );
}

export function KeyHint({ keys, label }: Readonly<{ keys: RemoteKeys; label: string }>) {
  return (
    <Hint text={`${keys}${label}`} size={HINT_SIZE} gap={3} color="textDim" textStyle={s.hint} />
  );
}
