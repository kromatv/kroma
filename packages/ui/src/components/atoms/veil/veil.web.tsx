import { sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { classes } from '#ui/lib/classed';
import { gradient } from '#ui/lib/css';
import { StaticView } from '#ui/lib/static-view';
import type { VeilProps } from './veil.types';
import { veilBitmap } from './veil-bitmap';

const sDefinition = styles({
  layer: { fill: true, pointerEvents: 'none' },
  bitmap: {
    fill: true,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    willChange: 'transform',
  },
});

function Veil({ ramp }: Readonly<VeilProps>) {
  const scope = useStyleScope();
  const s = useStyles(sDefinition);
  const bitmap = veilBitmap(ramp);
  if (!bitmap) {
    return <StaticView style={[s.layer, sharedStyle(`veil:${ramp}`, gradient(ramp), scope)]} />;
  }
  return <img src={bitmap} alt="" aria-hidden draggable={false} className={classes(s.bitmap)} />;
}

export type { VeilProps };
export { Veil };
