// One row of the palette, and the empty face the list falls back to.

import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles, sv } from '#ui/core';
import type { CommandItem } from './command-list';
import { METRICS } from './command-list';

interface CommandRowProps {
  item: CommandItem;
  /** The row that is already open behind the palette. */
  open: boolean;
  /** The row the keyboard cursor is on. */
  cursor: boolean;
  /** Both are handed the row's `item`, so one handler serves the whole list
   *  rather than a closure per row. */
  onHover: (item: CommandItem) => void;
  onPress: (item: CommandItem) => void;
}

function CommandRow({ item, open, cursor, onHover, onPress }: Readonly<CommandRowProps>) {
  return (
    <Focusable
      label={item.label}
      ring={false}
      // The pointer moves the SAME cursor the arrows do, rather than lighting a
      // second row of its own: with two highlights on screen, Enter opens
      // whichever one the reader was not looking at.
      onHoverIn={() => onHover(item)}
      onPress={() => onPress(item)}
      sv={row}
      vars={{ cursor, open }}
    >
      {({ slots }) => (
        <>
          {item.icon ? (
            <Icon name={item.icon} size={15} color={open ? 'accent' : 'textDim'} />
          ) : null}
          <Text variant="meta" style={slots.label} lines={1}>
            {item.label}
          </Text>
          <Box flex />
          {item.meta ? (
            <Text variant="meta" color="textDim" style={s.meta} lines={1}>
              {item.meta}
            </Text>
          ) : null}
          {open ? <Box w={5} h={5} radius="pill" bg="accent" /> : null}
        </>
      )}
    </Focusable>
  );
}

const s = styles({ meta: { fontSize: 11.5 } });

// The sheet is a lifted surface, where the chrome's plain focus wash reads as
// nothing; the keyboard cursor wears the same coat as focus, since only one of
// the two drives at a time.
const row = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 10,
      h: METRICS.row,
      px: 8,
      radius: 'sm',
      _focus: { bg: 'white/7' },
    },
    label: { fontSize: 13.5, fontWeight: '600', color: 'textMuted' },
  },
  variants: {
    cursor: { true: { root: { bg: 'white/7' }, label: { color: 'text' } } },
    open: { true: { label: { color: 'text' } } },
  },
  defaults: { cursor: false, open: false },
});

export type { CommandRowProps };
export { CommandRow };
