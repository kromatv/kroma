// <Menu>: the anchored action menu behind a "..." trigger (a download row's
// pause/retry/remove, a card's overflow). The trigger is the kit's round
// icon button; where the items appear is the platform's decision (see
// ./menu-surface): an anchored panel with the menu keyboard under a pointer,
// a dialog under a D-pad.

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { View } from 'react-native';
import { IconButton, type IconButtonProps } from '#ui/components/atoms/icon-button';
import { useControllable } from '#ui/lib/use-controllable';
import {
  MenuContext,
  type MenuDismissReason,
  type MenuOpenDetails,
  type MenuOpenReason,
  type MenuState,
  useMenu,
} from './menu-context';
import { Item, labelOf, type MenuItemProps, Separator } from './menu-item';
import { MenuSurface } from './menu-surface';
import type { MenuRowSpec } from './menu-surface-dialog';

interface MenuRootProps {
  /** Names the menu and, unless it names itself, the trigger. */
  label?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: MenuOpenDetails) => void;
  /** Which trigger edge the panel hugs. `end` for a right-pinned row action. */
  align?: 'start' | 'end';
  /** A <Menu.Trigger>, then the <Menu.Item>s and <Menu.Separator>s. Only DIRECT
   *  children take part in the menu. */
  children: ReactNode;
}

function isItem(node: ReactNode): node is ReactElement<MenuItemProps> {
  return isValidElement(node) && node.type === Item;
}

function isEntry(node: ReactNode): node is ReactElement {
  return isItem(node) || (isValidElement(node) && node.type === Separator);
}

function Root({
  label,
  open: openProp,
  defaultOpen,
  onOpenChange,
  align = 'end',
  children,
}: Readonly<MenuRootProps>) {
  const [open, setOpenState] = useControllable(openProp, defaultOpen ?? false);
  const anchor = useRef<View>(null);

  const kids = Children.toArray(children);
  const entries = kids.filter(isEntry);
  const rows: MenuRowSpec[] = entries.flatMap((entry, at) =>
    isItem(entry)
      ? [
          {
            at,
            label: labelOf(entry.props),
            disabled: entry.props.disabled === true,
            select: entry.props.onSelect,
          },
        ]
      : [],
  );

  const setOpen = useCallback(
    (next: boolean, reason: MenuOpenReason) => {
      setOpenState(next);
      onOpenChange?.(next, { reason });
    },
    [setOpenState, onOpenChange],
  );

  const dismiss = useCallback((reason: MenuDismissReason) => setOpen(false, reason), [setOpen]);

  const state = useMemo<MenuState>(
    () => ({ open, label, anchor, setOpen }),
    [open, label, setOpen],
  );

  return (
    <MenuContext.Provider value={state}>
      {kids.filter((node) => !isEntry(node))}
      <MenuSurface
        open={open}
        label={label}
        align={align}
        entries={entries}
        rows={rows}
        anchor={anchor}
        onDismiss={dismiss}
      />
    </MenuContext.Provider>
  );
}

interface MenuTriggerBind {
  ref: RefObject<View | null>;
  expanded: boolean;
  onPress: () => void;
}

interface MenuTriggerProps extends Omit<IconButtonProps, 'onPress' | 'expanded' | 'ref'> {
  /** A control of your own in place of the round icon button. Spread `bind`
   *  onto the PRESSABLE element: it anchors the surface and opens it. */
  render?: (bind: MenuTriggerBind, state: { open: boolean }) => ReactElement;
}

/** What opens the menu. `children` are the button's FACE, not a control of
 *  their own - a pressable in there is a second stop for the D-pad; use
 *  `render` for a trigger the caller owns. */
function Trigger({
  render,
  icon = 'dots-vertical',
  size = 32,
  variant = 'ghost',
  label,
  ...button
}: Readonly<MenuTriggerProps>) {
  const { open, label: menuLabel, anchor, setOpen } = useMenu('Trigger');
  const bind: MenuTriggerBind = {
    ref: anchor,
    expanded: open,
    onPress: () => setOpen(true, 'trigger'),
  };
  if (render) return render(bind, { open });
  return (
    <IconButton
      {...button}
      ref={anchor}
      icon={icon}
      label={label ?? menuLabel}
      size={size}
      variant={variant}
      expanded={open}
      onPress={bind.onPress}
    />
  );
}

const Menu = { Root, Trigger, Item, Separator };

export type { MenuTone } from './menu-item';
export type {
  MenuDismissReason,
  MenuItemProps,
  MenuOpenDetails,
  MenuOpenReason,
  MenuRootProps,
  MenuTriggerBind,
  MenuTriggerProps,
};
export { Menu };
