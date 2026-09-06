import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import type { TableVariant } from './table-context';

interface FrameProps {
  variant: TableVariant;
  label?: string;
  children: ReactNode;
}

// The table is as wide as the room it is given and never scrolls sideways: a
// flex column shrinks to its `min` and truncates, and a column that cannot fit
// a phone says `from: 'md'` and leaves.
function Frame({ variant, label, children }: Readonly<FrameProps>) {
  return (
    <Box role="table" aria-label={label} style={variant === 'framed' ? s.framed : undefined}>
      {children}
    </Box>
  );
}

const s = styles({
  framed: { border: 'border', radius: 'xl', bg: 'surface1', overflow: 'hidden' },
});

export { Frame };
