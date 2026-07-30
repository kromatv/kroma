// <ExpandableText>: a paragraph clamped to a few lines with a "more"
// affordance that expands it in place on a press.
//
// A clamped <Text> reports its clamped geometry, so whether it overflows at
// all can't be read off the visible copy: it's measured against a hidden,
// unclamped ghost rendered behind it, by height (`onLayout`), since
// react-native-web never fires `onTextLayout`.
//
// `moreLabel` is a prop, not a translation call: the kit knows no app's
// i18n, so the host names the affordance the same way it names a Focusable.
// A television build simply renders it clamped — the press is a pointer's or
// a thumb's gesture, and a D-pad synopsis wants a screen of its own.

import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Txt, type TxtProps } from '#ui/components/atoms/text';

interface ExpandableTextProps extends Pick<TxtProps, 'variant' | 'color' | 'style'> {
  children: string;
  /** How many lines the collapsed state shows. */
  lines?: number;
  /** The affordance's text, in the host's language. Drawn as `… {moreLabel}`. */
  moreLabel: string;
}

function ExpandableText({
  children,
  lines = 3,
  moreLabel,
  variant = 'body',
  color = 'textMuted',
  style,
}: Readonly<ExpandableTextProps>) {
  const [expanded, setExpanded] = useState(false);
  // Overflow = the ghost is taller than the clamped copy, with a pixel of
  // slack for sub-pixel line metrics.
  const [shown, setShown] = useState(0);
  const [full, setFull] = useState(0);
  const [hovered, setHovered] = useState(false);
  const clampable = full > shown + 1;
  return (
    <Pressable
      onPress={() => clampable && setExpanded((prev) => !prev)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole={clampable ? 'button' : undefined}
    >
      <Txt
        variant={variant}
        color={color}
        style={style}
        lines={expanded ? undefined : lines}
        onLayout={(event) => {
          // Only the CLAMPED height is the comparison's left side; expanded,
          // the visible copy is the ghost's own height and says nothing.
          if (!expanded) setShown(event.nativeEvent.layout.height);
        }}
      >
        {children}
      </Txt>
      {/* The measuring ghost: unclamped, invisible, untouchable. */}
      <Txt
        accessible={false}
        variant={variant}
        style={[style, styles.ghost]}
        onLayout={(event) => setFull(event.nativeEvent.layout.height)}
      >
        {children}
      </Txt>
      {/* The affordance answers the cursor by going amber: it is the one part
          of the paragraph that does anything, and on the web that has to read
          BEFORE the click. The hover callbacks fire on the browser targets
          alone, so the phone and the TV keep the plain label. */}
      {clampable && !expanded ? (
        <Txt
          variant="meta"
          color={hovered ? 'accent' : 'text'}
          style={styles.more}
        >{`… ${moreLabel}`}</Txt>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  more: { fontWeight: '700', marginTop: 2 },
});

export type { ExpandableTextProps };
export { ExpandableText };
