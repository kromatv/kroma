import { sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { classes } from './classed';
import { gradient } from './css';
import { StaticView } from './static-view';
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

/** The ramp drawn once into a small bitmap stretched over the box, or as CSS where it cannot be drawn. */
export function VeilLayer({ ramp }: Readonly<{ ramp: string }>) {
  const scope = useStyleScope();
  const s = useStyles(sDefinition);
  const bitmap = veilBitmap(ramp);
  if (!bitmap) {
    return <StaticView style={[s.layer, sharedStyle(`veil:${ramp}`, gradient(ramp), scope)]} />;
  }
  return <img src={bitmap} alt="" aria-hidden draggable={false} className={classes(s.bitmap)} />;
}
