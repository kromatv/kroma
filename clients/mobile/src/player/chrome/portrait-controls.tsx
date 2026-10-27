import { Box, styles, useStyles } from '@kromatv/ui/kit';
import type { Engine } from '#mobile/player/engine';
import { TransportControls } from './transport-controls';

export function PortraitControls({ engine, poke }: Readonly<{ engine: Engine; poke(): void }>) {
  const s = useStyles(definition);
  return (
    <Box fill pointerEvents="box-none">
      <Box style={s.wash} pointerEvents="none" />
      <TransportControls engine={engine} poke={poke} compact />
    </Box>
  );
}

const definition = styles({ wash: { fill: true, bg: 'black/20' } });
