import { Box, styles, Text, useStyles } from '@kromatv/ui/kit';
import { KromaMark, useClock } from '#tv/shared/ui';

const sDefinition = styles({ clock: { fontVariant: ['tabular-nums'] } });

export function BrandBar() {
  const s = useStyles(sDefinition);

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
