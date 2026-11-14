const REST = 20;
const INLINE = 16;
const DESIGN = 110;
const GAP = 10;

interface ControlsLiftInput {
  visible: boolean;
  compact: boolean;
  barHeight: number;
  bottomInset: number;
}

export function controlsLift({
  visible,
  compact,
  barHeight,
  bottomInset,
}: Readonly<ControlsLiftInput>): number {
  if (!visible) return REST + bottomInset;
  if (compact) return INLINE + bottomInset;
  return barHeight > 0 ? barHeight + GAP : DESIGN + bottomInset;
}
