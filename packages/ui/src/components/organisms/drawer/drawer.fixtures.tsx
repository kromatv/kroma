import { type ReactNode, useState } from 'react';

import { Box } from '#ui/components/atoms/box';

import { Button } from '#ui/components/atoms/button';

import { Drawer, type DrawerRootProps } from './drawer';

export type DemoProps = Omit<DrawerRootProps, 'open' | 'onClose' | 'children'>;

export const LONG_LIST = Array.from({ length: 24 }, (_, i) => `tv.kroma.module${i}`);

export function Demo({
  body,
  ...props
}: Readonly<DemoProps & { body: (close: () => void) => ReactNode }>) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Box>
      <Button
        variant="glass"
        label={`Open ${props.side ?? 'right'} drawer`}
        onPress={() => setOpen(true)}
      />
      <Drawer.Root {...props} open={open} onClose={close}>
        {body(close)}
      </Drawer.Root>
    </Box>
  );
}
