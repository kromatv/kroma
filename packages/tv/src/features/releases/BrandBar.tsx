import { Box, styles, Text } from '@kromatv/ui/kit';
import { KromaMark, useClock } from '#tv/shared/ui';

const s = styles({ clock: { fontVariant: ['tabular-nums'] } });

export function BrandBar() {
  const clock = useClock();
  return (
    <Box
      absolute
      left={64}
      right={64}
      top={44}
      row
      align="center"
      justify="space-between"
      pointerEvents="none"
    >
      <KromaMark size={28} />
      <Text variant="labelTv" style={s.clock}>
        {clock}
      </Text>
    </Box>
  );
}
