// Settings dialog for a choice with too many answers to cycle on OK.
// Virtualised: a TV's cost follows the number of mounted focusables.

import { useT } from '@kroma/ui';
import { Dialog, Icon, ListRow, VirtualGrid } from '@kroma/ui/kit';
import type { ChoiceItem } from '#tv/app/settings/items';

const ROW_HEIGHT = 68;
const ROW_GAP = 8;
const LIST_HEIGHT = ROW_HEIGHT * 7 + ROW_GAP * 6;

// <ListRow.Root> is `width: '100%'`, and a virtualised row container has no
// width of its own to resolve against, so the row collapses to its trailing
// glyph.
const PANEL_WIDTH = 620;
// Must match <Dialog>'s own panel padding.
const PANEL_PADDING = 40;
const ROW_WIDTH = PANEL_WIDTH - PANEL_PADDING * 2;

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
    <Dialog open onClose={onClose} title={title} width={PANEL_WIDTH}>
      <VirtualGrid
        data={options}
        columns={1}
        itemHeight={ROW_HEIGHT + ROW_GAP}
        style={{ height: LIST_HEIGHT, width: ROW_WIDTH }}
        rowStyle={{ width: ROW_WIDTH }}
        initialIndex={current > 0 ? current : undefined}
        renderItem={(option) => (
          <ListRow.Root
            label={t(item.valueLabel(option))}
            style={{ height: ROW_HEIGHT, width: ROW_WIDTH }}
            chevron={false}
            onPress={() => {
              onPick(option);
              onClose();
            }}
          >
            <ListRow.Trailing>
              {option === value ? (
                <Icon name="check" size={20} stroke={2.4} color="accentText" />
              ) : null}
            </ListRow.Trailing>
          </ListRow.Root>
        )}
      />
    </Dialog>
  );
}
