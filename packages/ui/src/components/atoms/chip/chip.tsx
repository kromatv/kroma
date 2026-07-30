import type { StyleProp, ViewStyle } from 'react-native';
// <Chip>: the pill filter / selector (language codes, audio formats, genres,
// recent searches). Focusable, so the same component is a click target in the
// browser and a D-pad stop on a TV.

import type { ReactNode } from 'react';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { sv } from '#ui/lib/sv';
import { colors, fonts, radius } from '#ui/lib/tokens';

const chipVariants = sv({
  slots: {
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: { fontFamily: fonts.ui, fontWeight: '600' },
  },
  variants: {
    active: {
      true: { root: { backgroundColor: colors.accent } },
      false: { root: { backgroundColor: 'rgba(255, 255, 255, 0.07)' } },
    },
    /** `subtle` is the strip that floats over the browse screens' ambient art:
     *  a fainter wash, no border, and muted text so it recedes until focused. */
    variant: {
      solid: { label: { color: colors.text } },
      subtle: {
        root: { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 0 },
        label: { color: colors.textMuted },
      },
      /** An opaque raised chip, for strips that sit on the page rather than over
       *  artwork (the season picker on a series detail screen). */
      surface: {
        root: { backgroundColor: colors.surface2, borderWidth: 0 },
        label: { color: colors.textMuted },
      },
    },
    size: {
      sm: { label: { fontSize: 13 } },
      tv: { root: { paddingVertical: 10, paddingHorizontal: 22 }, label: { fontSize: 18 } },
    },
  },
  compound: [
    // The active accent - fill and ink - wins over whatever idle colours the
    // variant declared: every variant sets its own resting background, and
    // variant styles merge after the `active` group's.
    {
      when: { active: 'true' },
      style: {
        root: { backgroundColor: colors.accent },
        label: { color: colors.accentInk },
      },
    },
  ],
  defaults: { active: 'false', size: 'sm', variant: 'solid' },
});

// A chip carries no focus scale, so on a page with no focus scope this hover
// wash is all a cursor has to go on.
const HOVERED = {
  solid: { backgroundColor: 'rgba(255, 255, 255, 0.13)' },
  subtle: { backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  surface: { backgroundColor: colors.surface3 },
} as const;

// An active chip is a solid accent fill, so it hovers up the amber ladder
// like every other filled control rather than back down to a white wash.
const HOVERED_ACTIVE = { backgroundColor: colors.accentHover } as const;

interface ChipProps extends Omit<FocusableProps, 'children' | 'style' | 'label'> {
  active?: boolean;
  size?: 'sm' | 'tv';
  variant?: 'solid' | 'subtle' | 'surface';
  /** Leading glyph, before the label. */
  icon?: IconName;
  label?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function Chip({
  active = false,
  size = 'sm',
  variant = 'solid',
  icon,
  label,
  children,
  style,
  ...focusProps
}: Readonly<ChipProps>) {
  // `subtle` and `surface` both recede until focused, so their idle label is
  // muted; the default solid chip carries full-strength text. The label reads
  // its ink from the slot; the glyph needs the same colour as a prop.
  const idle = variant === 'solid' ? colors.text : colors.textMuted;
  const s = chipVariants({ active: active ? 'true' : 'false', size, variant });
  return (
    <Focusable
      {...focusProps}
      label={label}
      style={[s.root, style]}
      hoveredStyle={active ? HOVERED_ACTIVE : HOVERED[variant]}
    >
      {icon ? (
        <Icon
          name={icon}
          size={size === 'tv' ? 17 : 15}
          stroke={2}
          color={active ? colors.accentInk : idle}
        />
      ) : null}
      {label === undefined ? null : <Txt style={s.label}>{label}</Txt>}
      {children}
    </Focusable>
  );
}

export type { ChipProps };
export { Chip, chipVariants };
