import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { useTableGrid } from './table-columns';
import type { TableVariant } from './table-context';

interface FrameProps {
  variant: TableVariant;
  label?: string;
  children: ReactNode;
}

function Frame({ variant, label, children }: Readonly<FrameProps>) {
  const scope = useStyleScope();
  const s = useStyles(sDefinition);

  const minWidth = useTableGrid()?.minWidth ?? 0;
  const frame = variant === 'framed' ? s.framed : undefined;
  if (minWidth === 0) {
    return (
      <Box role="table" aria-label={label} style={frame}>
        {children}
      </Box>
    );
  }
  const floor = sharedStyle(`table:floor:${minWidth}`, { minWidth }, scope);
  return (
    <Box style={frame}>
      <ScrollView horizontal style={s.scroller} contentContainerStyle={s.track}>
        <Box role="table" aria-label={label} style={[s.wide, floor]}>
          {children}
        </Box>
      </ScrollView>
    </Box>
  );
}

const sDefinition = styles({
  framed: { border: 'border', radius: 'xl', bg: 'surface1', overflow: 'hidden' },
  scroller: { grow: 0, shrink: 1 },
  track: { grow: 1 },
  wide: { grow: 1 },
});

export { Frame };
