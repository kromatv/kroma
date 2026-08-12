import { DocFigure } from '@kroma/workbench';
import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { space } from '#ui/core/tokens';

interface FigureProps {
  caption?: string;
  row?: boolean;
  children: ReactNode;
}

/** A live specimen in a guide: framed, captioned, and sitting in the document's
 * own figure block, so it keeps the measure and the rhythm a table or a fenced
 * sample has. */
function Figure({ caption, row = false, children }: Readonly<FigureProps>) {
  return (
    <DocFigure>
      <Box
        bg="surface1"
        radius="lg"
        p={space[5]}
        row={row}
        wrap={row}
        align={row ? 'center' : 'stretch'}
        gapX={space[6]}
        gapY={space[4]}
        style={s.frame}
      >
        {children}
      </Box>
      {caption ? (
        <Text variant="meta" color="textDim" style={s.caption}>
          {caption}
        </Text>
      ) : null}
    </DocFigure>
  );
}

const s = styles({
  frame: { borderWidth: 1, borderColor: 'border' },
  caption: { marginTop: space[2] },
});

export type { FigureProps };
export { Figure };
