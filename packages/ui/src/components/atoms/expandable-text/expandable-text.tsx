// <ExpandableText>: a paragraph clamped to a few lines with a "more"
// affordance that expands it in place on a press.
//
// A clamped <Text> reports its clamped geometry, so whether it overflows at
// all can't be read off the visible copy: it's measured against a hidden,
// unclamped ghost rendered behind it, by height (`onLayout`), since
// react-native-web never fires `onTextLayout`. Those two measurements are also
// what make the expansion animatable: they ARE the from and to.
//
// `moreLabel` is a prop, not a translation call: the kit knows no app's
// i18n, so the host names the affordance the same way it names a Focusable.
// A television build simply renders it clamped: the press is a pointer's or
// a thumb's gesture, and a D-pad synopsis wants a screen of its own.

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, type ViewStyle } from 'react-native';
import { Text, type TextProps } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { motion } from '#ui/core/tokens';
import { a11yState } from '#ui/lib/a11y';
import { ease } from '#ui/lib/ease';
import { WEB } from '#ui/lib/platform';

const GROW_MS = motion.duration.base;

interface ExpandableTextProps extends Pick<TextProps, 'variant' | 'color' | 'style'> {
  children: string;
  /** How many lines the collapsed state shows. */
  lines?: number;
  /** The affordance's text, in the host's language. Drawn alone: a clamped
   *  paragraph already ends in an ellipsis on every platform, and prefixing a
   *  second one reads as two truncations. */
  moreLabel: string;
  /**
   * Grow and shrink between the two heights rather than jumping. On by
   * default: the paragraph moves everything under it, and a jump reads as the
   * page having reloaded. Pass `false` where the surrounding layout animates
   * already, or in a test that would rather not wait.
   */
  animate?: boolean;
}

function ExpandableText({
  children,
  lines = 3,
  moreLabel,
  variant = 'body',
  color = 'textMuted',
  style,
  animate = true,
}: Readonly<ExpandableTextProps>) {
  const [expanded, setExpanded] = useState(false);
  // Overflow = the ghost is taller than the clamped copy, with a pixel of
  // slack for sub-pixel line metrics.
  const [shown, setShown] = useState(0);
  const [full, setFull] = useState(0);
  const [hovered, setHovered] = useState(false);
  const clampable = full > shown + 1;

  // The clamp and the expansion are separate: the text must be UNCLAMPED for
  // the whole growth (there is nothing to reveal otherwise) and stays that way
  // until a collapse has finished shrinking, or the last lines would vanish
  // before the box reached them.
  const [clamped, setClamped] = useState(true);
  useEffect(() => {
    if (expanded) {
      setClamped(false);
      return;
    }
    if (!animate) {
      setClamped(true);
      return;
    }
    const settle = setTimeout(() => setClamped(true), GROW_MS);
    return () => clearTimeout(settle);
  }, [expanded, animate]);

  const measured = shown > 0 && full > 0;
  const height = expanded ? full : shown;
  // Before the first measurement the box has no height to hold: it sizes to
  // its content, which is what produces the measurement.
  const box = animate && measured && clampable ? height : undefined;

  return (
    <Pressable
      onPress={() => clampable && setExpanded((prev) => !prev)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole={clampable ? 'button' : undefined}
      {...(clampable ? a11yState({ expanded }) : null)}
    >
      <Grow height={box}>
        <Text
          variant={variant}
          color={color}
          style={style}
          lines={clamped ? lines : undefined}
          onLayout={(event) => {
            // Only the CLAMPED height is the comparison's left side; expanded,
            // the visible copy is the ghost's own height and says nothing.
            if (!expanded && clamped) setShown(event.nativeEvent.layout.height);
          }}
        >
          {children}
        </Text>
      </Grow>
      {/* The measuring ghost: unclamped, invisible, untouchable. `aria-hidden`
          as well as `accessible={false}`, which react-native-web does not
          implement - without it the paragraph is in the tree twice. */}
      <Text
        accessible={false}
        aria-hidden
        variant={variant}
        style={[style, s.ghost]}
        onLayout={(event) => setFull(event.nativeEvent.layout.height)}
      >
        {children}
      </Text>
      {/* The affordance answers the cursor by going amber: it is the one part
          of the paragraph that does anything, and on the web that has to read
          BEFORE the click. The hover callbacks fire on the browser targets
          alone, so the phone and the TV keep the plain label. */}
      {clampable && !expanded ? (
        <Text variant="meta" color={hovered ? 'accent' : 'text'} style={s.more}>
          {moreLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The growing box. A height cannot go through the native driver, so the two
 *  platforms animate it their own way: a CSS transition in the browser, an
 *  `Animated` value elsewhere. `undefined` means "size to the content", which
 *  is how the first measurement happens. */
function Grow({ height, children }: Readonly<{ height?: number; children: ReactNode }>) {
  const [value] = useState(() => new Animated.Value(height ?? 0));
  const settled = useRef(height);
  useEffect(() => {
    if (WEB || height === undefined) return;
    // The first known height is adopted rather than animated to: there was no
    // previous one to grow from.
    if (settled.current === undefined) {
      value.setValue(height);
      settled.current = height;
      return;
    }
    settled.current = height;
    Animated.timing(value, {
      toValue: height,
      duration: GROW_MS,
      easing: ease.out.native,
      useNativeDriver: false,
    }).start();
  }, [height, value]);

  if (height === undefined) return <>{children}</>;
  if (WEB) {
    return (
      <Animated.View style={[s.clip, TRANSITION as ViewStyle, { height }]}>
        {children}
      </Animated.View>
    );
  }
  return <Animated.View style={[s.clip, { height: value }]}>{children}</Animated.View>;
}

// react-native-web understands these CSS-only props; React Native's types do
// not, hence the cast at the use site.
const TRANSITION = {
  transitionProperty: 'height',
  transitionDuration: `${GROW_MS}ms`,
  transitionTimingFunction: ease.out.css,
};

const s = styles({
  ghost: { absolute: true, left: 0, right: 0, top: 0, opacity: 0, pointerEvents: 'none' },
  more: { fontWeight: '700', mt: 2 },
  clip: { overflow: 'hidden' },
});

export type { ExpandableTextProps };
export { ExpandableText };
