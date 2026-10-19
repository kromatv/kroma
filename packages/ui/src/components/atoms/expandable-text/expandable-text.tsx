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

import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, type TextProps } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { motion } from '#ui/core/tokens';
import { a11yState } from '#ui/lib/a11y';
import { HeightGlide } from '#ui/lib/height-glide';

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
  const s = useStyles(sDefinition);

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
  const [settled, setSettled] = useState(true);
  const clamped = !expanded && (!animate || settled);
  useEffect(() => {
    if (expanded || !animate) return;
    const settle = setTimeout(() => setSettled(true), GROW_MS);
    return () => clearTimeout(settle);
  }, [expanded, animate]);

  const measured = shown > 0 && full > 0;
  const height = expanded ? full : shown;
  // Before the first measurement the box has no height to hold: it sizes to
  // its content, which is what produces the measurement.
  const box = animate && measured && clampable ? height : undefined;

  return (
    <Pressable
      onPress={() => {
        if (!clampable) return;
        if (!expanded) setSettled(false);
        setExpanded(!expanded);
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole={clampable ? 'button' : undefined}
      {...(clampable ? a11yState({ expanded }) : null)}
    >
      <HeightGlide height={box} durationMs={GROW_MS}>
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
      </HeightGlide>
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

const sDefinition = styles({
  ghost: { absolute: true, left: 0, right: 0, top: 0, opacity: 0, pointerEvents: 'none' },
  more: { fontWeight: '700', mt: 2 },
});

export type { ExpandableTextProps };
export { ExpandableText };
