// Settings dialog for a choice with too many answers to cycle on OK.
// Virtualised: a TV's cost follows the number of mounted focusables.

import { useT } from '@kroma/ui';
import {
  CONTROL,
  DIALOG_PAD,
  Dialog,
  Icon,
  ListRow,
  RING_ROOM,
  SURFACE_WIDTH,
  VirtualGrid,
} from '@kroma/ui/kit';
import type { ChoiceItem } from '#tv/app/settings/items';

const ROW_HEIGHT = CONTROL.tv.height;
// Rows stand a ring apart, so a focused one never lays its ring on its
// neighbour and the strip's top padding hides the row above rather than
// leaving a sliver of it in the ring's room.
const ROW_GAP = RING_ROOM;
const VISIBLE_ROWS = 7;
// The strip parks the top row of a page at the content origin and the clip is
// flush there, so the room that row's ring stands in is the content's padding.
const LIST_HEIGHT = (ROW_HEIGHT + ROW_GAP) * VISIBLE_ROWS;

// <ListRow.Root> is `width: '100%'`, and a virtualised row container has no
// width of its own to resolve against, so the row collapses to its trailing
// glyph.
const ROW_WIDTH = SURFACE_WIDTH.lg - DIALOG_PAD * 2;

export interface ChoicePickerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  item: ChoiceItem;
  options: readonly string[];
  value: string;
  onPick: (next: string) => void;
}

export function ChoicePicker({
  open,
  onClose,
  title,
  item,
  options,
  value,
  onPick,
}: Readonly<ChoicePickerProps>) {
  const t = useT();
  // Unmounted while closed rather than hidden, so `initialIndex` below fires on
  // every opening instead of only the first.
  if (!open) return null;

  const current = options.indexOf(value);

  return (
    <Dialog.Root open onClose={onClose} title={title} width="lg">
      <VirtualGrid
        data={options}
        columns={1}
        itemHeight={ROW_HEIGHT}
        rowGap={ROW_GAP}
        pt={RING_ROOM}
        width={ROW_WIDTH}
        style={{ height: LIST_HEIGHT, width: ROW_WIDTH }}
        initialIndex={current}
        renderItem={(option) => (
          <ListRow.Root
            style={{ height: ROW_HEIGHT, width: ROW_WIDTH }}
            ground="surface"
            chevron={false}
            role="option"
            selected={option === value}
            onPress={() => {
              onPick(option);
              onClose();
            }}
          >
            <ListRow.Label>{t(item.valueLabel(option))}</ListRow.Label>
            <ListRow.Trailing>
              {option === value ? (
                <Icon name="check" size={20} thickness={2.4} color="accentText" />
              ) : null}
            </ListRow.Trailing>
          </ListRow.Root>
        )}
      />
    </Dialog.Root>
  );
}
