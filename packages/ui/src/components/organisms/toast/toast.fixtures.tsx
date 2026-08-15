import type { ReactNode } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Toaster, type ToastPosition } from './toast';

export // The story's stand-in for a screen. <Toaster/> is a full-bleed layer over its
// parent, so a demo has to give it one; the app gives it the view the shell
// fills. The triggers sit in a padded sibling, never around the host.
function Screen({
  height = 340,
  position,
  children,
}: Readonly<{ height?: number; position?: ToastPosition; children: ReactNode }>) {
  return (
    <Box h={height} radius="lg" bg="surface1" border="border" overflow="hidden">
      <Box flex p={20} gap={12} align="flex-start" justify="center">
        {children}
      </Box>
      <Toaster position={position} inset={16} />
    </Box>
  );
}

export const POSITIONS: ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
