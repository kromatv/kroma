// <Menu>'s two presentations of its items, and the one thing that picks between
// them: the dialog a D-pad drives, and the anchored panel a pointer drives.

import { type ReactElement, useCallback, useId, useMemo, useState } from 'react';
import { useListKeys } from '#ui/lib/anchored-keys';
import {
  useActiveDescendant,
  useAnchoredPlacement,
  useTriggerFocus,
  useTriggerKeys,
} from '#ui/lib/anchored-panel';
import { AnchoredPopup } from '#ui/lib/anchored-popup';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { useSurfacePresentation } from '#ui/lib/surface-presentation';
import { MenuRowContext, type MenuRowState } from './menu-context';
import { type MenuRowSpec, MenuSurfaceDialog, type MenuSurfaceProps } from './menu-surface-dialog';

function MenuSurface(props: Readonly<MenuSurfaceProps>) {
  const presentation = useSurfacePresentation(props.presentation);
  if (presentation === 'dialog') return <MenuSurfaceDialog {...props} />;
  return props.open ? <MenuPanel {...props} /> : null;
}

const MIN_WIDTH = 184;
const MAX_HEIGHT = 400;

interface PanelEntryProps {
  entry: ReactElement;
  nativeID: string;
  index: number;
  active: boolean;
  keyed: boolean;
  onActivate: (index: number) => void;
  onFire: (index: number) => void;
}

function PanelEntry({
  entry,
  nativeID,
  index,
  active,
  keyed,
  onActivate,
  onFire,
}: Readonly<PanelEntryProps>) {
  const row = useMemo<MenuRowState>(
    () => ({
      presentation: 'panel',
      nativeID,
      active,
      keyed,
      onHoverIn: () => onActivate(index),
      fire: () => onFire(index),
    }),
    [nativeID, index, active, keyed, onActivate, onFire],
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
  const keyed = useFocusVisible(active);

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
            keyed={keyed}
            onActivate={setActive}
            onFire={fireAt}
          />
        );
      })}
    </AnchoredPopup>
  );
}

export { MenuSurface };
