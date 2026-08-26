import { Box, type BoxProps, color, PageMain } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';

export const PAGE_GUTTER = { base: 16, md: 24, lg: 40, tv: 56 } as const;

export function PageFrame({ children, ...box }: Readonly<BoxProps>) {
  return (
    <PageMain>
      <Box px={PAGE_GUTTER} pt={36} pb={80} {...box}>
        {children}
      </Box>
    </PageMain>
  );
}

/** Where the scrim sits, and so the floor a modal's own panel has to float
 *  above (see `features/catalog/modal-shell`). */
export const SCRIM_Z = 60;

/** Above the player, which shares the scrim's floor: the cast picker opens from
 *  inside the player and has to land in front of it. */
export const CAST_PICKER_Z = SCRIM_Z + 10;

export const MODAL_SCRIM: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: SCRIM_Z,
  backgroundColor: color('black/66'),
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
};

export const PAGE_RADIAL =
  'radial-gradient(120% 90% at 50% 0%, var(--kroma-surface-1), var(--kroma-bg) 70%)';
