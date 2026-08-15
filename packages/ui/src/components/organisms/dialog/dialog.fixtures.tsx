import { type ReactNode, useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { Dialog, type DialogRootProps } from './dialog';

export type DemoProps = Omit<DialogRootProps, 'open' | 'onClose' | 'children'>;

export function Demo({
  panel,
  ...props
}: Readonly<DemoProps & { panel: (close: () => void) => ReactNode }>) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Box>
      <Button label="Open" onPress={() => setOpen(true)} />
      <Dialog.Root {...props} open={open} onClose={close}>
        {panel(close)}
      </Dialog.Root>
    </Box>
  );
}
