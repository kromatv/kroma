// <Chip>: the pill filter / selector (language codes, audio formats, genres,
// recent searches). Focusable, so the same component is a click target in the
// browser and a D-pad stop on a TV.

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { type ColorValue, type StyleDecl, svFor } from '#ui/core';
import { useLocaleDefault } from '#ui/services/i18n';

/**
 * The whole design, including every state it can be in.
 *
 * A chip carries no focus scale, so the hover wash each variant declares is all
 * a cursor has to go on where there is no focus scope.
 */
const chipVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  dot: StyleDecl;
  count: StyleDecl;
  icon: Pick<IconProps, 'color' | 'size'>;
}>()({
  slots: {
    root: { row: true, align: 'center', gap: 8, py: 6, px: 14, radius: 'pill', border: 'border' },
    label: { font: 'ui', fontWeight: '600' },
    dot: { w: 7, h: 7, radius: 'pill', shrink: 0 },
    count: { font: 'ui', fontWeight: '600', opacity: 0.6 },
    icon: { color: 'text' },
  },
  variants: {
    variant: {
      solid: {
        root: { bg: 'white/7', _hover: { bg: 'white/13' } },
        label: { color: 'text' },
        count: { color: 'text' },
      },
      /** `subtle` is the strip that floats over the browse screens' ambient art:
       *  a fainter wash, no border, and muted text so it recedes until focused. */
      subtle: {
        root: { bg: 'white/8', borderWidth: 0, _hover: { bg: 'white/14' } },
        label: { color: 'textMuted' },
        count: { color: 'textMuted' },
        icon: { color: 'textMuted' },
      },
      /** An opaque raised chip, for strips that sit on the page rather than over
       *  artwork (the season picker on a series detail screen). */
      surface: {
        root: { bg: 'surface2', borderWidth: 0, _hover: { bg: 'surface3' } },
        label: { color: 'textMuted' },
        count: { color: 'textMuted' },
        icon: { color: 'textMuted' },
      },
    },
    /** Declared after `variant` so the accent fill and ink beat whatever idle
     *  colours the variant declared. A filled chip hovers up the amber ladder
     *  rather than back down to a white wash. */
    active: {
      true: {
        root: { bg: 'accent', _hover: { bg: 'accentHover' } },
        label: { color: 'accentInk' },
        count: { color: 'accentInk' },
        icon: { color: 'accentInk' },
        dot: { bg: 'accentInk' },
      },
    },
    size: {
      sm: { label: { fontSize: 13 }, count: { fontSize: 13 }, icon: { size: 15 } },
      tv: {
        root: { py: 10, px: 22 },
        label: { fontSize: 18 },
        count: { fontSize: 18 },
        dot: { w: 9, h: 9 },
        icon: { size: 17 },
      },
    },
  },
  defaults: { variant: 'solid', active: false, size: 'sm' },
});

interface ChipProps extends Omit<FocusableProps, 'children' | 'style' | 'label'> {
  active?: boolean;
  size?: 'sm' | 'tv';
  variant?: 'solid' | 'subtle' | 'surface';
  /** Leading glyph, before the label. */
  icon?: IconName;
  /** A status colour as a dot before the label. An active chip paints it in
   *  ink, so it stays visible on the accent fill. */
  dot?: ColorValue;
  /** A trailing count, in the label's colour at lower emphasis. */
  count?: number;
  label?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function Chip({
  active = false,
  size = 'sm',
  variant = 'solid',
  icon,
  dot,
  count,
  label,
  children,
  style,
  ...focusProps
}: Readonly<ChipProps>) {
  const locale = useLocaleDefault();
  return (
    <Focusable
      {...focusProps}
      label={label}
      sv={chipVariants}
      vars={{ active, size, variant }}
      style={style}
    >
      {(state) => (
        <>
          {icon ? <Icon name={icon} stroke={2} {...state.slots.icon} /> : null}
          {dot ? <Box bg={active ? undefined : dot} style={state.slots.dot} /> : null}
          {label === undefined ? null : <Txt style={state.slots.label}>{label}</Txt>}
          {count === undefined ? null : (
            <Txt style={state.slots.count}>{count.toLocaleString(locale)}</Txt>
          )}
          {children}
        </>
      )}
    </Focusable>
  );
}

export type { ChipProps };
export { Chip, chipVariants };
