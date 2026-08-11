// <Disclosure>: a collapsible section with a divider header ("Advanced"). The
// header is a button announcing `expanded`, so assistive tech hears the state
// the chevron shows.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useControllable } from '#ui/lib/use-controllable';

interface DisclosureProps {
  title: string;
  /** Present: you own the state (controlled). Absent: the disclosure runs
   *  itself from `defaultOpen` and reports through `onOpenChange`. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (next: boolean) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function Disclosure({
  title,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  style,
  children,
}: Readonly<DisclosureProps>) {
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  return (
    <Box style={style}>
      <Divider spacing={0} />
      <Focusable
        label={title}
        expanded={open}
        onPress={() => setOpen(!open)}
        style={s.header}
        states={HEADER_STATES}
      >
        <Text variant="overline" color="accentText">
          {title}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textMuted" />
      </Focusable>
      {open ? <Box pt={4}>{children}</Box> : null}
    </Box>
  );
}

const HEADER_STATES = { hover: { opacity: 0.85 } } as const;

const s = styles({
  header: {
    row: true,
    align: 'center',
    justify: 'space-between',
    gap: 12,
    py: 16,
    self: 'stretch',
  },
});

export type { DisclosureProps };
export { Disclosure };
