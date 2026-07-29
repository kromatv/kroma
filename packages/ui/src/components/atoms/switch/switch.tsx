// <Switch>: the on/off primitive.
//
// A television has no gestures, so this is not a draggable thumb: it is a
// Focusable that toggles on Select. The state has to be legible from three
// metres, which is why the track fills amber rather than relying on the thumb's
// position alone.
//
// The flip ANIMATES, on the kit's usual split (see <VirtualRail>, which set the
// pattern): a CSS transition on the browser targets, where react-native-web has
// no native animated module and every `Animated` value is a rAF loop on the main
// thread, and `Animated` with the real native driver on the phones and the TVs.
// Only compositor-friendly properties move - the thumb is a `translateX` and the
// amber is a FILL LAYER crossfading over the off-track, because neither driver
// can animate a background colour natively and a colour that snapped while the
// thumb slid read as two switches disagreeing.

import { useEffect, useRef } from 'react';
import { Animated, Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { ease } from '#ui/lib/ease';
import { sv } from '#ui/lib/sv';
import { colors, motion, radius } from '#ui/lib/tokens';
import { useControllable } from '#ui/lib/use-controllable';

const WEB = Platform.OS === 'web';

const FLIP_MS = motion.duration.fast;
const EASE_CSS = ease.out.css;
const EASE_NATIVE = ease.out.native;

const switchVariants = sv({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    // The OFF colours live on the base and the amber is a layer over them, so
    // the state change is a crossfade rather than a repaint. `overflow` keeps
    // the fill layer's corners inside the pill.
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  variants: {
    size: {
      sm: { width: 46, height: 28, padding: 3 },
      /** The 10-foot size, for a settings row read from the sofa. */
      tv: { width: 64, height: 36, padding: 4 },
    },
    /** Styleless on purpose: the checked look is the CROSSFADE LAYERS above,
     * which a static style cannot describe - but `checked` is still the
     * component's axis, and the workbench matrix reads the axes from here. */
    checked: { true: {}, false: {} },
  },
  defaults: { size: 'sm', checked: 'false' },
});

/** Thumb diameter per size, derived from the track so the two cannot drift. */
const THUMB = { sm: 20, tv: 26 } as const;
/** How far the thumb slides: the track less its padding less the thumb. Static
 * per size, which is what lets the animation need no measurement pass. */
const TRAVEL = { sm: 46 - 3 * 2 - 20, tv: 64 - 4 * 2 - 26 } as const;

type SwitchSize = keyof typeof THUMB;

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
      style={switchVariants({ size }, disabled ? DISABLED : null, style)}
      hoveredStyle={HOVERED}
    >
      <Flip on={checked} travel={TRAVEL[size]} thumb={THUMB[size]} />
    </Focusable>
  );
}

interface SwitchFaceProps {
  checked: boolean;
  size?: SwitchSize;
  style?: ViewStyle;
}

/**
 * The switch's VISUALS alone: the track, the amber fill and the sliding thumb,
 * with nothing pressable about them.
 *
 * For surfaces where the switch is not its own control. The player's settings
 * menu is the one that forced the split: its rows drive focus through the
 * panel's own list navigation, so the whole ROW is the control and a `Focusable`
 * switch inside it would be a second stop the D-pad has to fight past - which is
 * why that menu used to carry a private lookalike, drifting from this atom one
 * hue at a time.
 */
function SwitchFace({ checked, size = 'sm', style }: Readonly<SwitchFaceProps>) {
  return (
    <View style={[...switchVariants({ size }), style]}>
      <Flip on={checked} travel={TRAVEL[size]} thumb={THUMB[size]} />
    </View>
  );
}

/** The moving parts: the amber fill fading in over the track, and the thumb
 * sliding across it. The thumb keeps ONE face - light in both states, the way
 * every platform's toggle does it - because the track is the state signal and a
 * thumb that changed colour mid-slide read as two things happening. One value
 * drives fill and slide, so neither can arrive before the other. */
function Flip({ on, travel, thumb }: Readonly<{ on: boolean; travel: number; thumb: number }>) {
  const face = { width: thumb, height: thumb, borderRadius: radius.pill };
  if (WEB) {
    return (
      <>
        <View style={[styles.fill, TRANSITION_OPACITY as ViewStyle, { opacity: on ? 1 : 0 }]} />
        <View
          style={[
            face,
            styles.thumb,
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
  /** 0 = off, 1 = on. The initial value matches the initial state, so a switch
   * mounted on does not play its own flip as an entrance. */
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
      <Animated.View style={[styles.fill, { opacity: flip }]} />
      <Animated.View style={[face, styles.thumb, { transform: [{ translateX: slide }] }]} />
    </>
  );
}

const DISABLED = { opacity: 0.5 } as const;

/** The track under a POINTER: both the OFF wash and the hairline come up.
 * Brightening the wash cannot be mistaken for the state, because the state is a
 * LAYER - the amber ON fill covers the track entirely (see `styles.fill`), so
 * what this lifts is only ever the off colour, and the border carries the hover
 * on its own once the switch is on. */
const HOVERED = {
  backgroundColor: 'rgba(255, 255, 255, 0.18)',
  borderColor: 'rgba(255, 255, 255, 0.32)',
} as const;

/** react-native-web understands these CSS-only props; React Native's types do
 * not, hence the casts at the use sites. */
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

const styles = StyleSheet.create({
  /** The ON track, as a layer: the amber and its border fade in as one. */
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  thumb: { backgroundColor: colors.text },
});

export type { SwitchFaceProps, SwitchProps, SwitchSize };
export { Switch, SwitchFace, switchVariants };
