// <ChoicePicker>: the settings dialog for a choice with too many answers to cycle.
//
// The settings rows cycle on OK, which is right for the choices this app grew up
// with - four keyboard layouts, two engines, on and off. It stops being right the
// moment a list is long: the preferred audio language now offers every language
// there is, and "press OK a hundred and forty times to reach Swedish" is not a
// control. So a choice can ask for a LIST instead (see `pick` in settings/items),
// and this is that list.
//
// Two decisions carry it, and both are about the length rather than the dialog.
//
// It is VIRTUALISED. A television's cost follows the number of mounted
// focusables, and two hundred rows of them is the same bill the poster grid was
// virtualised to avoid; <VirtualGrid> with one column is that list, virtual nodes
// and all, so the remote still reaches the bottom.
//
// It OPENS ON THE CURRENT VALUE. A picker that always opens at the top makes
// someone walk back down to their own choice just to confirm it, and with the
// window not yet mounted around that row, `autoFocus` cannot do it - hence
// `initialIndex`, which drives the list's own ref.

import { useT } from '@kroma/ui';
import { Box, Dialog, Icon, ListRow, VirtualGrid } from '@kroma/ui/kit';
import type { ChoiceItem } from '#tv/app/settings/items';

/** Row pitch: the row's own height plus the gap under it. A virtualised list
 * computes its offsets from this, so the row is pinned to the same number. */
const ROW_HEIGHT = 68;
const ROW_GAP = 8;

/** Tall enough to show a handful of rows, short enough to leave the dialog's
 * title and the screen's edges visible - a list that fills the screen loses the
 * "this is a choice, Back cancels it" reading a dialog gives for free. */
const LIST_HEIGHT = ROW_HEIGHT * 7 + ROW_GAP * 6;

/**
 * The width a row actually gets, spelled out rather than left to a percentage.
 *
 * <ListRow> is `width: '100%'`, and a virtualised row container has no width of
 * its own for that to be a percentage OF - so the row resolved to nothing. What
 * you saw was the chevron and no label, because the label lives in a `flex` box
 * (which collapses to zero) while the trailing glyph is a fixed size (which does
 * not). The poster grid never hit this: its tiles are sized in pixels.
 */
const PANEL_WIDTH = 620;
/** <Dialog> pads its panel by this on every side. */
const PANEL_PADDING = 40;
const ROW_WIDTH = PANEL_WIDTH - PANEL_PADDING * 2;

/** The tick's column, held open on every row so the labels stay in one line. */
const TICK = 20;

export interface ChoicePickerProps {
  open: boolean;
  onClose: () => void;
  /** The setting's own label, over the list. */
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
  // Unmounted while closed rather than left in the tree hidden, so every opening
  // is a fresh mount - which is what makes `initialIndex` below fire each time
  // instead of only on the first.
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
          <ListRow
            label={t(item.valueLabel(option))}
            style={{ height: ROW_HEIGHT, width: ROW_WIDTH }}
            onPress={() => {
              onPick(option);
              onClose();
            }}
            // ALWAYS a box, never a bare conditional. <ListRow> falls back to a
            // chevron with `trailing ?? (onPress ? … )`, and neither `null` nor
            // `undefined` survives a `??` - so a row that passed "no tick" got
            // the "leads somewhere" chevron instead, which is the opposite of
            // what a row that picks in place means. Handing it a box that is
            // sometimes empty says "nothing here" in the only way `??` hears,
            // and keeps the tick in one column down the list either way - the
            // same rule the kit's own <Select> option rows follow.
            trailing={
              <Box w={TICK} align="center">
                {option === value ? (
                  <Icon name="check" size={20} stroke={2.4} color="accent" />
                ) : null}
              </Box>
            }
          />
        )}
      />
    </Dialog>
  );
}
