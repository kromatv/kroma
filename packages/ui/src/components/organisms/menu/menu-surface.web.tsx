// The web's two presentations of <Menu>'s items. Inside a focus scope the
// dialog presentation stands; unscoped, the items are an anchored panel with
// the menu keyboard: arrows move the active item, Enter fires it, printable
// keys type ahead, Esc returns to the trigger. DOM focus stays on the panel
// and `aria-activedescendant` names the active row.

import { type ReactElement, useCallback, useId, useMemo, useState } from 'react';
import {
  useActiveDescendant,
  useAnchoredPlacement,
  useListKeys,
  useTriggerFocus,
  useTriggerKeys,
} from '#ui/lib/anchored-panel';
import { AnchoredPopup } from '#ui/lib/anchored-popup';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { MenuRowContext, type MenuRowState } from './menu-context';
import { type MenuRowSpec, MenuSurfaceDialog, type MenuSurfaceProps } from './menu-surface-dialog';

function MenuSurface(props: Readonly<MenuSurfaceProps>) {
  const scoped = useInsideFocusScope();
  if (scoped) return <MenuSurfaceDialog {...props} />;
  return props.open ? <MenuPanel {...props} /> : null;
}

const MIN_WIDTH = 184;
const MAX_HEIGHT = 400;

interface PanelEntryProps {
  entry: ReactElement;
  nativeID: string;
  index: number;
  active: boolean;
  onActivate: (index: number) => void;
  onFire: (index: number) => void;
}

function PanelEntry({
  entry,
  nativeID,
  index,
  active,
  onActivate,
  onFire,
}: Readonly<PanelEntryProps>) {
  const row = useMemo<MenuRowState>(
    () => ({
      presentation: 'panel',
      nativeID,
      active,
      onHoverIn: () => onActivate(index),
      fire: () => onFire(index),
    }),
    [nativeID, index, active, onActivate, onFire],
  );
  return <MenuRowContext.Provider value={row}>{entry}</MenuRowContext.Provider>;
}

function MenuPanel({ onDismiss, label, entries, rows, align, anchor }: Readonly<MenuSurfaceProps>) {
  const baseId = useId();
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      rows.findIndex((row) => !row.disabled),
    ),
  );

  const at = useAnchoredPlacement(anchor, {
    minWidth: MIN_WIDTH,
    maxHeight: MAX_HEIGHT,
    align,
    grow: align !== 'end',
  });
  useTriggerFocus(anchor);

  const fire = useCallback(
    (row: MenuRowSpec | undefined) => {
      if (!row || row.disabled) return;
      onDismiss('select');
      row.select();
    },
    [onDismiss],
  );

  const fireAt = useCallback((index: number) => fire(rows[index]), [fire, rows]);

  const { onKeyDown } = useListKeys({
    count: rows.length,
    active,
    setActive,
    disabledAt: (i) => rows[i]?.disabled === true,
    labelAt: (i) => rows[i]?.label ?? '',
    onPick: (i) => fire(rows[i]),
    onClose: () => onDismiss('escape'),
  });

  // The trigger keeps the focus and therefore the keyboard; see <Select>.
  useTriggerKeys(anchor, { listId: `${baseId}-list`, haspopup: 'menu', onKeyDown });
  useActiveDescendant(anchor, `${baseId}-${active}`);

  if (!at) return null;

  return (
    <AnchoredPopup
      at={at}
      role="menu"
      label={label}
      listId={`${baseId}-list`}
      onDismiss={() => onDismiss('outside')}
    >
      {entries.map((entry, position) => {
        const index = rows.findIndex((row) => row.at === position);
        return (
          <PanelEntry
            key={entry.key}
            entry={entry}
            nativeID={`${baseId}-${index}`}
            index={index}
            active={index === active}
            onActivate={setActive}
            onFire={fireAt}
          />
        );
      })}
    </AnchoredPopup>
  );
}

export { MenuSurface };
