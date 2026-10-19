import { sharedStyle, styles, sv, useStyleScope, useSv } from '#ui/core';

// <Switch>: the on/off primitive. A television has no gestures, so this is
// not a draggable thumb: it is a Focusable that toggles on Select, and the
// track fills amber (rather than relying on thumb position alone) so the
// state reads from three metres.
//
// The flip animates on the kit's usual split (see <VirtualRail>): a CSS
// transition on the browser targets, `Animated` with the real native driver
// elsewhere. Only compositor-friendly properties move: the thumb is a
// `translateX` and the amber is a fill layer crossfading over the off-track,
// since neither driver can animate a background colour natively.

import { Animated, type StyleProp, View, type ViewStyle } from 'react-native';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';

import { useStyles } from '#ui/core/styles';
import { motion } from '#ui/core/tokens';
import { useFlipMotion } from '#ui/lib/flip-motion';
import { useControllable } from '#ui/lib/use-controllable';

const FLIP_MS = motion.duration.fast;

// The hairline is INSIDE the declared width (React Native sizes border-box) and
// the padding inside that, so the thumb's run is the width less both. Leaving
// the edge out of it parked the thumb 2px past the padding at the ON end, and
// the gap stopped matching the OFF end.
const edge = 1;

const track = {
  sm: { w: 46, h: 28, pad: 3, thumb: 20 },
  tv: { w: 64, h: 36, pad: 4, thumb: 26 },
} as const;

// Static per size, so the animation needs no measurement pass.
const travelOf = (size: SwitchSize) =>
  track[size].w - 2 * edge - 2 * track[size].pad - track[size].thumb;

const switchVariants = sv({
  base: {
    row: true,
    align: 'center',
    radius: 'pill',
    // The OFF colours live on the base and the amber is a layer over them, so
    // the state change is a crossfade rather than a repaint. `overflow` keeps
    // the fill layer's corners inside the pill.
    bg: 'tint/10',
    border: 'borderStrong',
    overflow: 'hidden',
    // The off wash and the hairline both come up under a pointer. Brightening
    // the wash cannot be mistaken for the state: the amber on-fill is a layer
    // that covers the track entirely (see `s.fill`), so this only ever lifts
    // the off colour.
    _hover: { bg: 'tint/18', border: 'tint/32' },
    _disabled: { opacity: 0.5 },
  },
  variants: {
    size: {
      sm: { w: track.sm.w, h: track.sm.h, p: track.sm.pad },
      tv: { w: track.tv.w, h: track.tv.h, p: track.tv.pad },
    },
    /** Styleless on purpose: the checked look is the crossfade layers below,
     * which a static style can't describe, but `checked` is still the
     * component's axis, and the workbench matrix reads the axes from here. */
    checked: { true: {} },
  },
  defaults: { size: 'sm', checked: false },
});

type SwitchSize = keyof typeof track;

interface SwitchProps extends Omit<
  FocusableProps,
  'children' | 'onPress' | 'style' | 'role' | 'checked'
> {
  /** Present: you own the state (controlled). Absent: the switch runs itself
   *  from `defaultChecked` and reports through `onCheckedChange`. */
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  size?: SwitchSize;
  style?: StyleProp<ViewStyle>;
}

function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  size = 'sm',
  disabled = false,
  style,
  ...focusProps
}: Readonly<SwitchProps>) {
  const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onCheckedChange);
  return (
    <Focusable
      {...focusProps}
      role="switch"
      checked={checked}
      disabled={disabled}
      onPress={() => setChecked(!checked)}
      sv={switchVariants}
      vars={{ size, checked }}
      style={style}
    >
      <Flip on={checked} travel={travelOf(size)} thumb={track[size].thumb} />
    </Focusable>
  );
}

interface SwitchFaceProps {
  checked: boolean;
  size?: SwitchSize;
  style?: ViewStyle;
}

/**
 * The switch's visuals alone: the track, the amber fill and the sliding
 * thumb, with nothing pressable about them, for surfaces where the switch is
 * not its own control (a settings row that drives focus through its own list
 * navigation, where a `Focusable` switch would be a second stop the D-pad has
 * to fight past).
 */
function SwitchFace({ checked, size = 'sm', style }: Readonly<SwitchFaceProps>) {
  const switchVariantsScoped = useSv(switchVariants);

  return (
    <View style={[switchVariantsScoped({ size }).root, style]}>
      <Flip on={checked} travel={travelOf(size)} thumb={track[size].thumb} />
    </View>
  );
}

// The thumb keeps one face, light in both states: the track is the state
// signal, and a thumb that changed colour mid-slide read as two things
// happening. One value drives both the fill and the slide, so neither can
// arrive before the other.
function Flip({ on, travel, thumb }: Readonly<{ on: boolean; travel: number; thumb: number }>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);
  const motion = useFlipMotion(on, travel, FLIP_MS);

  const face = sharedStyle(`switch:thumb:${thumb}`, { w: thumb, h: thumb, radius: 'pill' }, scope);
  return (
    <>
      <Animated.View style={[s.fill, motion.fill]} />
      <Animated.View style={[face, s.thumb, motion.slide]} />
    </>
  );
}

const sDefinition = styles({
  fill: { fill: true, bg: 'accent', radius: 'pill' },
  thumb: { bg: 'text' },
});

export type { SwitchFaceProps, SwitchProps, SwitchSize };
export { Switch, SwitchFace, switchVariants };
