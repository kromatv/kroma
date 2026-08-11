// The web's two presentations of <Menu>'s items. Inside a focus scope the
// dialog presentation stands; unscoped, the items are an anchored panel with
// the menu keyboard: arrows move the active item, Enter fires it, printable
// keys type ahead, Esc returns to the trigger. DOM focus stays on the panel
// and `aria-activedescendant` names the active row.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Pressable, ScrollView, type View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Icon } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import {
  PANEL_BACKDROP,
  PANEL_SHELL,
  useAnchoredPlacement,
  useListKeys,
  useTriggerFocus,
} from '#ui/lib/anchored-panel';
import { CONTROL } from '#ui/lib/field-shell';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { Portal } from '#ui/lib/portal';
import { useTDefault } from '#ui/services/i18n';
import type { MenuItem } from './menu';
import { MenuSurfaceDialog, type MenuSurfaceProps, menuItemVariants } from './menu-surface-dialog';

function MenuSurface(props: Readonly<MenuSurfaceProps>) {
  const scoped = useInsideFocusScope();
  if (scoped) return <MenuSurfaceDialog {...props} />;
  return props.open ? <MenuPanel {...props} /> : null;
}

const MIN_WIDTH = 184;
const MAX_HEIGHT = 400;
const PANEL_PAD = 6;
const ROW_RADIUS = CONTROL.sm.radius;
// Concentric with the rows inside it: ROW_RADIUS plus PANEL_PAD.
const PANEL_RADIUS = 'xl';

function MenuPanel({ onClose, label, items, align, anchor }: Readonly<MenuSurfaceProps>) {
  const t = useTDefault();
  const baseId = useId();
  const panel = useRef<View>(null);
  const rows = items.filter((entry): entry is MenuItem => entry !== 'separator');
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
    (row: MenuItem | undefined) => {
      if (!row || row.disabled) return;
      onClose();
      row.onSelect();
    },
    [onClose],
  );

  const { onKeyDown } = useListKeys({
    count: rows.length,
    active,
    setActive,
    disabledAt: (i) => rows[i]?.disabled === true,
    labelAt: (i) => rows[i]?.label ?? '',
    onPick: (i) => fire(rows[i]),
    onClose,
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

  let rowIndex = -1;
  return (
    <Portal>
      <Pressable
        accessibilityLabel={t('common.close')}
        tabIndex={-1}
        onPress={onClose}
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
            {items.map((entry, index) => {
              if (entry === 'separator') {
                // biome-ignore lint/suspicious/noArrayIndexKey: separators carry no identity
                return <Divider key={`rule-${index}`} spacing={6} />;
              }
              rowIndex += 1;
              const i = rowIndex;
              return (
                <PanelItem
                  key={entry.label}
                  id={`${baseId}-${i}`}
                  item={entry}
                  active={i === active}
                  onHover={() => setActive(i)}
                  onPress={() => fire(entry)}
                />
              );
            })}
          </Box>
        </ScrollView>
      </Box>
    </Portal>
  );
}

function PanelItem({
  id,
  item,
  active,
  onHover,
  onPress,
}: Readonly<{
  id: string;
  item: MenuItem;
  active: boolean;
  onHover: () => void;
  onPress: () => void;
}>) {
  const slots = menuItemVariants({ danger: item.danger ?? false });
  return (
    <Pressable
      nativeID={id}
      role="menuitem"
      accessibilityState={{ disabled: item.disabled }}
      tabIndex={-1}
      onPress={onPress}
      onHoverIn={onHover}
      style={[
        slots.root,
        s.row,
        active && item.danger ? s.activeDanger : null,
        active && !item.danger ? s.active : null,
        item.disabled ? s.disabled : null,
      ]}
    >
      {item.icon ? (
        <Icon name={item.icon} size={15} color={item.danger ? 'danger' : 'text/80'} />
      ) : null}
      <Txt variant="body" style={[slots.ink, s.label]}>
        {item.label}
      </Txt>
    </Pressable>
  );
}

const s = styles({
  row: { radius: ROW_RADIUS },
  active: { bg: 'tint/7' },
  activeDanger: { bg: 'danger/14' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 13, fontWeight: '600' },
});

export { MenuSurface };
