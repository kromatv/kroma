// The web's two presentations of <Menu>'s items. Inside a focus scope the
// dialog presentation stands; unscoped, the items are an anchored panel with
// the menu keyboard: arrows move the active item, Enter fires it, printable
// keys type ahead, Esc returns to the trigger. DOM focus stays on the panel
// and `aria-activedescendant` names the active row.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Pressable, ScrollView, type View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import {
  PANEL_BACKDROP,
  PANEL_SHELL,
  useAnchoredPlacement,
  useListKeys,
  useTriggerFocus,
} from '#ui/lib/anchored-panel';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { Portal } from '#ui/lib/portal';
import { useTDefault } from '#ui/services/i18n';
import { MenuRowContext } from './menu-context';
import { type MenuRowSpec, MenuSurfaceDialog, type MenuSurfaceProps } from './menu-surface-dialog';

function MenuSurface(props: Readonly<MenuSurfaceProps>) {
  const scoped = useInsideFocusScope();
  if (scoped) return <MenuSurfaceDialog {...props} />;
  return props.open ? <MenuPanel {...props} /> : null;
}

const MIN_WIDTH = 184;
const MAX_HEIGHT = 400;
const PANEL_PAD = 6;
// Concentric with the rows inside it: the row radius plus PANEL_PAD.
const PANEL_RADIUS = 'xl';

function MenuPanel({ onDismiss, label, entries, rows, align, anchor }: Readonly<MenuSurfaceProps>) {
  const t = useTDefault();
  const baseId = useId();
  const panel = useRef<View>(null);
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
  useEffect(() => {
    const trigger = anchor.current as HTMLElement | null;
    if (!trigger) return;
    const onKey = (event: KeyboardEvent) => {
      onKeyDown({
        nativeEvent: { key: event.key },
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
      });
    };
    trigger.addEventListener('keydown', onKey);
    trigger.setAttribute('aria-controls', `${baseId}-list`);
    trigger.setAttribute('aria-haspopup', 'menu');
    return () => {
      trigger.removeEventListener('keydown', onKey);
      trigger.removeAttribute('aria-controls');
      trigger.removeAttribute('aria-haspopup');
    };
  }, [anchor, baseId, onKeyDown]);

  useEffect(() => {
    const trigger = anchor.current as HTMLElement | null;
    if (!trigger) return;
    trigger.setAttribute('aria-activedescendant', `${baseId}-${active}`);
    return () => trigger.removeAttribute('aria-activedescendant');
  }, [anchor, baseId, active]);

  if (!at) return null;

  return (
    <Portal>
      <Pressable
        accessibilityLabel={t('common.close')}
        tabIndex={-1}
        onPress={() => onDismiss('outside')}
        style={PANEL_BACKDROP}
      />
      <Box
        ref={panel}
        nativeID={`${baseId}-list`}
        role="menu"
        accessibilityLabel={label}
        radius={PANEL_RADIUS}
        border="borderStrong"
        bg="surface2"
        shadow="pop"
        overflow="hidden"
        style={[
          PANEL_SHELL,
          {
            left: at.left,
            top: at.top,
            bottom: at.bottom,
            minWidth: at.width,
            maxWidth: at.maxWidth,
          },
        ]}
      >
        <ScrollView style={{ maxHeight: at.maxHeight }}>
          <Box p={PANEL_PAD}>
            {entries.map((entry, position) => {
              const index = rows.findIndex((row) => row.at === position);
              return (
                <MenuRowContext.Provider
                  key={entry.key}
                  value={{
                    presentation: 'panel',
                    nativeID: `${baseId}-${index}`,
                    active: index === active,
                    onHoverIn: () => setActive(index),
                    fire: () => fire(rows[index]),
                  }}
                >
                  {entry}
                </MenuRowContext.Provider>
              );
            })}
          </Box>
        </ScrollView>
      </Box>
    </Portal>
  );
}

export { MenuSurface };
