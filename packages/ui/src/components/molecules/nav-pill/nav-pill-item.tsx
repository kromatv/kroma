import {
  type ComponentRef,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import type { LayoutChangeEvent, View } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';
import { type LensRect, useNavPill } from './nav-pill-context';

/** A kit glyph by name, or a host's own component handed the item's current ink. */
type NavPillIcon = IconName | ((ink: string) => ReactNode);

// `color` is required rather than picked straight off IconProps: an item's ink
// is also handed to a host's own glyph component, which takes a string.
const navPillItemVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  icon: { color: string } & Pick<IconProps, 'size' | 'stroke'>;
}>()({
  slots: {
    root: { row: true, align: 'center', radius: 'pill' },
    label: { fontWeight: '700', letterSpacing: 0.2, color: 'textMuted' },
    icon: { color: 'glyph', stroke: 1.9 },
  },
  variants: {
    size: {
      tv: { root: { gap: 9, px: 18, py: 11 }, label: { fontSize: 18 }, icon: { size: 26 } },
      sm: {
        root: { gap: 6, px: 12, py: 10 },
        // Capped: a long locale label ("Rechercher") otherwise swallows the row.
        label: { fontSize: 12, maxW: 92, shrink: 1 },
        icon: { size: 22 },
      },
    },
    /** Under the lens: the current section, or the one a slide is previewing.
     *  It stays amber while focused, so only an unlit item brightens. */
    lit: {
      true: { label: { color: 'accentText' }, icon: { color: 'accentText' } },
      false: {
        label: { _focus: { color: 'text' } },
        icon: { _focus: { color: 'text' } },
      },
    },
    /** The active item already wears the lens, so it takes no focus wash on top. */
    active: { true: {}, false: { root: { _focus: { bg: 'tint/10' } } } },
  },
  defaults: { size: 'tv', lit: false, active: false },
});

interface NavPillItemProps
  extends Omit<FocusableProps, 'children' | 'onPress' | 'label' | 'style'> {
  icon: NavPillIcon;
  /** The item's accessible name, and the word under its glyph wherever the
   *  Root's label policy shows one. */
  label: string;
  /** The current section. At most one item should say so. */
  active?: boolean;
  onPress: () => void;
  ref?: Ref<ComponentRef<typeof View>>;
}

/** One section of the switcher. The WHOLE item is the control: one D-pad stop,
 *  a pointer hit area the size of the capsule's cell, and the lens travelling
 *  under it rather than a second pressable on top. */
function Item({ icon, label, active = false, onPress, ref, ...focus }: Readonly<NavPillItemProps>) {
  const { size, labels, claim, release, enrol, withdraw, hover } = useNavPill('Item');
  const id = useId();
  const rect = useRef<LensRect | null>(null);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      rect.current = { x, y, width, height };
      if (active) claim(id, rect.current);
    },
    [active, claim, id],
  );
  useEffect(() => {
    if (active && rect.current) claim(id, rect.current);
    if (!active) release(id);
  }, [active, claim, release, id]);

  // Never enrolled while disabled: an unenrolled item is invisible to the
  // hit-test, so a slide cannot select it. `select` reads onPress through a ref
  // so the slide never fires a stale closure.
  const select = useRef(onPress);
  select.current = onPress;
  useEffect(() => {
    if (focus.disabled) return;
    enrol(id, { label, rect: () => rect.current, select: () => select.current() });
    return () => withdraw(id);
  }, [enrol, withdraw, id, label, focus.disabled]);

  // Only the ink follows the finger; the label stays with `active`, so the
  // geometry under the finger is stable by construction.
  const lit = hover === null ? active : hover === id;
  const named = labels === 'all' || (labels === 'active' && active);

  return (
    <Box onLayout={onLayout}>
      <Focusable
        {...focus}
        ref={ref}
        onPress={onPress}
        label={label}
        role="tab"
        selected={active}
        focusScale={1.04}
        sv={navPillItemVariants}
        vars={{ size, lit, active }}
      >
        {(state) => (
          <>
            {typeof icon === 'string' ? (
              <Icon name={icon} {...state.slots.icon} />
            ) : (
              icon(state.slots.icon.color)
            )}
            {named ? (
              <Text style={state.slots.label} lines={1}>
                {label}
              </Text>
            ) : null}
          </>
        )}
      </Focusable>
    </Box>
  );
}

export type { NavPillIcon, NavPillItemProps };
export { Item, navPillItemVariants };
