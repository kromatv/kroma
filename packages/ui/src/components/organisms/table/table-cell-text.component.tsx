import type { ReactNode } from 'react';
import { Text } from '#ui/components/atoms/text';

type CellFace = 'body' | 'head' | 'sorted';

const INK = { body: 'textMuted', head: 'textDim', sorted: 'accent' } as const;

function CellText({ face, children }: Readonly<{ face: CellFace; children: ReactNode }>) {
  if (typeof children !== 'string') {
    return children;
  }
  return (
    <Text variant={face === 'body' ? 'body' : 'overline'} color={INK[face]} lines={1}>
      {children}
    </Text>
  );
}

export { CellText };
