// <Switch>: the on/off primitive. A television has no gestures, so this is
// not a draggable thumb: it is a Focusable that toggles on Select, and the
// track fills amber (rather than relying on thumb position alone) so the
// state reads from three metres.
//
// The flip animates on the kit's usual split (see <VirtualRail>): a CSS
// transition on the browser targets, `Animated` with the real native driver
// elsewhere. Only compositor-friendly properties move — the thumb is a
// `translateX` and the amber is a fill layer crossfading over the off-track,
// since neither driver can animate a background colour natively.

import { useEffect, useRef } from 'react';
import { Animated, Platform, type StyleProp, View, type ViewStyle } from 'react-native';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { sharedStyle, styles, sv } from '#ui/core';
import { motion } from '#ui/core/tokens';
import { ease } from '#ui/lib/ease';
import { useControllable } from '#ui/lib/use-controllable';

const WEB = Platform.OS === 'web';

const FLIP_MS = motion.duration.fast;
const EASE_CSS = ease.out.css;
const EASE_NATIVE = ease.out.native;

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
    bg: 'white/10',
    border: 'borderStrong',
    overflow: 'hidden',
    // The off wash and the hairline both come up under a pointer. Brightening
    // the wash cannot be mistaken for the state: the amber on-fill is a layer
    // that covers the track entirely (see `s.fill`), so this only ever lifts
    // the off colour.
    _hover: { bg: 'white/18', border: 'white/32' },
    _disabled: { opacity: 0.5 },
  },
  variants: {
    size: {
      sm: { w: track.sm.w, h: track.sm.h, p: track.sm.pad },
      tv: { w: track.tv.w, h: track.tv.h, p: track.tv.pad },
    },
    /** Styleless on purpose: the checked look is the crossfade layers below,
     * which a static style can't describe — but `checked` is still the
     * component's axis, and the workbench matrix reads the axes from here. */
    checked: { true: {} },
  },
  defaults: { size: 'sm', checked: false },
});

type SwitchSize = keyof typeof track;

interface SwitchProps extends Omit<FocusableProps, 'children' | 'onPress' | 'style'> {
  /** Present: you own the state (controlled). Absent: the switch runs itself
   *  from `defaultChecked` and reports through `onChange`. */
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (next: boolean) => void;
  size?: SwitchSize;
  style?: StyleProp<ViewStyle>;
}

function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onChange,
  size = 'sm',
  disabled = false,
  style,
  ...focusProps
}: Readonly<SwitchProps>) {
  const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onChange);
  return (
    <Focusable
      {...focusProps}
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
 * thumb, with nothing pressable about them — for surfaces where the switch is
 * not its own control (a settings row that drives focus through its own list
 * navigation, where a `Focusable` switch would be a second stop the D-pad has
 * to fight past).
 */
function SwitchFace({ checked, size = 'sm', style }: Readonly<SwitchFaceProps>) {
  return (
    <View style={[switchVariants({ size }).root, style]}>
      <Flip on={checked} travel={travelOf(size)} thumb={track[size].thumb} />
    </View>
  );
}

// The thumb keeps one face, light in both states: the track is the state
// signal, and a thumb that changed colour mid-slide read as two things
// happening. One value drives both the fill and the slide, so neither can
// arrive before the other.
function Flip({ on, travel, thumb }: Readonly<{ on: boolean; travel: number; thumb: number }>) {
  const face = sharedStyle(`switch:thumb:${thumb}`, { w: thumb, h: thumb, radius: 'pill' });
  if (WEB) {
    return (
      <>
        <View style={[s.fill, TRANSITION_OPACITY as ViewStyle, { opacity: on ? 1 : 0 }]} />
        <View
          style={[
            face,
            s.thumb,
            TRANSITION_TRANSFORM as ViewStyle,
            { transform: [{ translateX: on ? travel : 0 }] },
          ]}
        />
      </>
    );
  }
  return <FlipNative on={on} travel={travel} face={face} />;
}

function FlipNative({
  on,
  travel,
  face,
}: Readonly<{ on: boolean; travel: number; face: ViewStyle }>) {
  // Initial value matches the initial state, so a switch mounted on doesn't
  // play its own flip as an entrance.
  const flip = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(flip, {
      toValue: on ? 1 : 0,
      duration: FLIP_MS,
      easing: EASE_NATIVE,
      useNativeDriver: true,
    }).start();
  }, [on, flip]);
  const slide = flip.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  return (
    <>
      <Animated.View style={[s.fill, { opacity: flip }]} />
      <Animated.View style={[face, s.thumb, { transform: [{ translateX: slide }] }]} />
    </>
  );
}

// react-native-web understands these CSS-only props; React Native's types do
// not, hence the casts at the use sites.
const TRANSITION_OPACITY = {
  transitionProperty: 'opacity',
  transitionDuration: `${FLIP_MS}ms`,
  transitionTimingFunction: EASE_CSS,
};
const TRANSITION_TRANSFORM = {
  transitionProperty: 'transform',
  transitionDuration: `${FLIP_MS}ms`,
  transitionTimingFunction: EASE_CSS,
};

const s = styles({
  fill: { fill: true, bg: 'accent', radius: 'pill' },
  thumb: { bg: 'text' },
});

export type { SwitchFaceProps, SwitchProps, SwitchSize };
export { Switch, SwitchFace, switchVariants };
