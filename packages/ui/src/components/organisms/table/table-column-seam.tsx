import { useCallback } from 'react';
import { Seam } from '#ui/components/organisms/resizable/resizable-seam';
import type { ColumnResize } from './table-layout';

interface ColumnSeamProps {
  at: number;
  label: string | undefined;
  resize: ColumnResize;
}

function ColumnSeam({ at, label, resize }: Readonly<ColumnSeamProps>) {
  const { drag } = resize;
  const onDrag = useCallback(
    (delta: number, committed: boolean) => drag(at, delta, committed),
    [drag, at],
  );
  return (
    <Seam
      variant="column"
      orientation="horizontal"
      label={label}
      disabled={false}
      share={resize.share(at)}
      onBegin={resize.begin}
      onDrag={onDrag}
      onReset={resize.reset}
    />
  );
}

export { ColumnSeam };
