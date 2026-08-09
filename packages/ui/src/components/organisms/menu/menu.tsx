// <Menu>: the anchored action menu behind a "..." trigger (a download row's
// pause/retry/remove, a card's overflow). The trigger is the kit's round
// icon button; where the items appear is the platform's decision (see
// ./menu-surface): an anchored panel with the menu keyboard under a pointer,
// a dialog under a D-pad.

import { type ReactNode, type RefObject, useCallback, useRef, useState } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';
import type { IconName } from '#ui/components/atoms/icon';
import { IconButton, type IconButtonVariant } from '#ui/components/atoms/icon-button';
import { MenuSurface } from './menu-surface';

interface MenuItem {
  icon?: IconName;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Red ink: the destructive tail of the list. */
  danger?: boolean;
}

type MenuEntry = MenuItem | 'separator';

interface MenuProps {
  /** Accessible name of the trigger and the menu. */
  label: string;
  items: readonly MenuEntry[];
  /** Which trigger edge the panel hugs. `end` for a right-pinned row action. */
  align?: 'start' | 'end';
  /** Trigger glyph. */
  icon?: IconName;
  /** Trigger diameter. */
  size?: number;
  variant?: IconButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** A custom trigger in place of the round icon button. Attach `bind.ref` to
   *  the pressable element (it anchors the panel) and open with `bind.open`. */
  trigger?: (bind: {
    ref: RefObject<View | null>;
    expanded: boolean;
    open: () => void;
  }) => ReactNode;
}

function Menu({
  label,
  items,
  align = 'end',
  icon = 'dots-vertical',
  size = 32,
  variant = 'ghost',
  disabled = false,
  style,
  trigger,
}: Readonly<MenuProps>) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const anchor = useRef<View>(null);
  return (
    <>
      {trigger ? (
        trigger({ ref: anchor, expanded: open, open: () => setOpen(true) })
      ) : (
        <IconButton
          ref={anchor}
          icon={icon}
          label={label}
          size={size}
          variant={variant}
          disabled={disabled}
          expanded={open}
          onPress={() => setOpen(true)}
          style={style}
        />
      )}
      <MenuSurface
        open={open}
        onClose={close}
        label={label}
        items={items}
        align={align}
        anchor={anchor}
      />
    </>
  );
}

export type { MenuEntry, MenuItem, MenuProps };
export { Menu };
