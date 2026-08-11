// The D-pad presentation of <Menu>'s items: a <Dialog>, for the same reason
// <Select> uses one (the remote is confined to the options).

import type { RefObject } from 'react';
import type { View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { Dialog } from '#ui/components/organisms/dialog';
import { sv } from '#ui/core';
import { FocusColumn } from '#ui/lib/focus-scope';
import type { MenuEntry, MenuItem } from './menu';

export interface MenuSurfaceProps {
  open: boolean;
  onClose: () => void;
  label: string;
  items: readonly MenuEntry[];
  align: 'start' | 'end';
  anchor: RefObject<View | null>;
}

export const menuItemVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 10,
      px: 12,
      py: 9,
      radius: 'md',
      _hover: { bg: 'tint/7' },
    },
    ink: { color: 'text/80' },
  },
  variants: {
    danger: {
      true: { root: { _hover: { bg: 'danger/14' } }, ink: { color: 'danger' } },
    },
  },
  defaults: { danger: false },
});

export function MenuSurfaceDialog({ open, onClose, label, items }: Readonly<MenuSurfaceProps>) {
  return (
    <Dialog open={open} onClose={onClose} title={label} width={480}>
      <FocusColumn>
        {items.map((entry, index) =>
          entry === 'separator' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: separators carry no identity
            <Divider key={`rule-${index}`} spacing={6} />
          ) : (
            <DialogItem key={entry.label} item={entry} onClose={onClose} />
          ),
        )}
      </FocusColumn>
    </Dialog>
  );
}

function DialogItem({ item, onClose }: Readonly<{ item: MenuItem; onClose: () => void }>) {
  return (
    <Focusable
      role="menuitem"
      label={item.label}
      disabled={item.disabled}
      onPress={() => {
        onClose();
        item.onSelect();
      }}
      sv={menuItemVariants}
      vars={{ danger: item.danger ?? false }}
    >
      {(state) => (
        <>
          {item.icon ? (
            <Icon name={item.icon} size={16} color={item.danger ? 'danger' : 'text/80'} />
          ) : null}
          <Txt variant="body" style={state.slots.ink}>
            {item.label}
          </Txt>
          <Box flex />
        </>
      )}
    </Focusable>
  );
}
