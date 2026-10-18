import {
  activeTheme,
  type BoxStyleProps,
  radiusValue,
  type StyleScope,
  sharedStyle,
  style,
  styles,
  useStyleScope,
  useTheme,
} from '#ui/core';

// The pulse comes from `useLoop`: a native-driven opacity on a television, a CSS
// keyframe in a browser, never a per-frame JS callback per skeleton.

import { Animated, type StyleProp, View, type ViewStyle } from 'react-native';

import { useStyles } from '#ui/core/styles';
import { motion, type TypeRole, type TypeSpec } from '#ui/core/tokens';
import { useLoop } from '#ui/lib/loop';

/**
 * What the placeholder stands in for. `block` is a plain rounded rectangle sized
 * by the layout shorthands; `text` is a run of lines on a type role's rhythm;
 * `circle` takes `size` as its diameter; `poster` and `still` take the card
 * ratios (2:3 and 16:9) and only need a width.
 */
type SkeletonShape = 'block' | 'text' | 'circle' | 'poster' | 'still';

interface SkeletonProps extends BoxStyleProps {
  shape?: SkeletonShape;
  lines?: number;
  variant?: TypeRole;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const PULSE_MS = motion.duration.slow * 4;

// A line of text reads as its x-height, not as the whole em box.
const GLYPH = 0.7;

// The last line of a paragraph rarely runs to the margin.
const LAST_LINE = '60%';

const LAST = style({ width: LAST_LINE });

const boxOf = (box: BoxStyleProps, scope: StyleScope) =>
  sharedStyle(`skeleton:box:${JSON.stringify(box)}`, box, scope);

const rhythmOf = (leading: number, scope: StyleScope) =>
  sharedStyle(`skeleton:leading:${leading}`, { gap: leading, py: leading / 2 }, scope);

const barOf = (height: number, scope: StyleScope) =>
  sharedStyle(`skeleton:bar:${height}`, { height }, scope);

// An avatar, which is what a circular placeholder almost always stands in for.
const CIRCLE = 40;

const sDefinition = styles({
  wash: { bg: 'wash' },
  line: { bg: 'wash', radius: 'pill' },
  block: { radius: 'sm' },
  poster: { aspect: 2 / 3, radius: 'xl' },
  still: { aspect: 16 / 9, radius: 'xl' },
});

function Skeleton({
  shape = 'block',
  lines = 1,
  variant = 'body',
  size = CIRCLE,
  style,
  ...box
}: Readonly<SkeletonProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const theme = useTheme();
  const pulse = useLoop('pulse', PULSE_MS);

  if (shape === 'text') {
    const { bar, leading } = textRhythm(theme.typeSpec[variant]);
    return (
      // Half a leading top and bottom, so `lines` lines occupy exactly the
      // height the real text will and nothing shifts when it arrives.
      <Animated.View style={[rhythmOf(leading, scope), boxOf(box, scope), style, pulse]}>
        {Array.from({ length: lines }, (_, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder lines
            key={i}
            style={[s.line, barOf(bar, scope), lines > 1 && i === lines - 1 ? LAST : null]}
          />
        ))}
      </Animated.View>
    );
  }

  const shaped =
    shape === 'circle'
      ? {
          width: size,
          height: size,
          borderRadius: radiusValue('circle', size, activeTheme(scope.theme)),
        }
      : s[shape];

  return <Animated.View style={[s.wash, shaped, boxOf(box, scope), style, pulse]} />;
}

function textRhythm(spec: TypeSpec): { bar: number; leading: number } {
  const { size, ratio } = spec;
  const bar = Math.round(size * GLYPH);
  return { bar, leading: Math.round(size * ratio) - bar };
}

export type { SkeletonProps, SkeletonShape };
export { Skeleton };
