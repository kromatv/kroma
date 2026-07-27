// <ExpandableText>: the collapsed paragraph every synopsis wants.
//
// Netflix-style: clamped to a few lines with a "more" affordance, expanding in
// place on a press. Promoted from the phone app, where it was written, because
// a synopsis is clamped the same way on every surface that has a pointer or a
// thumb.
//
// The measurement trick is the whole component. A clamped <Text> reports its
// CLAMPED geometry, so whether the text overflows at all cannot be read off
// the visible copy - it is measured on a hidden, unclamped ghost rendered
// behind it, by HEIGHT (`onLayout`), because that is the one measurement both
// renderers make: react-native-web never fires `onTextLayout`, which is how
// the phone-only original silently lost its "more" affordance on the web.
//
// `moreLabel` is a prop, not a translation call: the kit knows no app's i18n,
// so the host names the affordance ("… more", "… plus") the same way it names
// a Focusable. A television build simply renders it clamped - the press is a
// pointer's and a thumb's gesture, and a D-pad synopsis wants a screen of its
// own, not a growing paragraph under the focus.

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
  /** The clamped copy's height and the ghost's. Overflow = the ghost is taller
   * (with a pixel of slack for sub-pixel line metrics). */
  const [shown, setShown] = useState(0);
  const [full, setFull] = useState(0);
  const clampable = full > shown + 1;
  return (
    <Pressable
      onPress={() => clampable && setExpanded((prev) => !prev)}
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
      {clampable && !expanded ? (
        <Txt variant="meta" style={styles.more}>{`… ${moreLabel}`}</Txt>
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
