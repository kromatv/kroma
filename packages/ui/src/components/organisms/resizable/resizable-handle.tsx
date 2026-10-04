import { useCallback } from 'react';
import { useResizableGroup, useSeamIndex } from './resizable-context';
import { Seam } from './resizable-seam';

interface ResizableHandleProps {
  /** Names the seam to assistive tech. */
  label?: string;
  /** Fixes the two panels either side of it; the seam stays drawn and stops
   *  being a focus stop. Set on the group instead to fix every seam at once. */
  disabled?: boolean;
}

/**
 * The seam between two `<Resizable.Panel>`s. Write it between them: it takes
 * its place from where it sits, so nothing has to be indexed by hand.
 *
 * The whole strip is the control - one D-pad stop, a pointer-sized hit area -
 * and it answers three gestures: drag it, press it to take the arrow keys, and
 * press it twice (or hold it) to put its two panels back.
 */
function Handle({ label = 'Resize', disabled }: Readonly<ResizableHandleProps>) {
  const at = useSeamIndex();
  const group = useResizableGroup('Handle');
  const { orientation, begin, drag, reset } = group;

  const onDrag = useCallback(
    (delta: number, committed: boolean) => drag(at, delta, committed),
    [drag, at],
  );
  const onReset = useCallback(() => reset(at), [reset, at]);

  return (
    <Seam
      variant="panel"
      orientation={orientation}
      label={label}
      disabled={disabled === true || group.disabled}
      share={Math.round(group.layout[at] ?? 0)}
      onBegin={begin}
      onDrag={onDrag}
      onReset={onReset}
    />
  );
}

export type { ResizableHandleProps };
export { Handle };
