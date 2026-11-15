import { View } from 'react-native';
import { activeTheme, color as resolve, useStyleScope } from '#ui/core';
import type { ColorToken } from '#ui/core/tokens';
import { G, Path, Svg } from '#ui/lib/svg';
import { NUMERAL_BOX, NUMERAL_GLYPHS } from './numeral-glyphs.gen';

const TRACKING = 0.08;
const DEFAULT_THICKNESS = 3;

interface NumeralProps {
  /** A fraction is cut to its whole part, a sign is dropped. */
  value: number;
  /** In px, outline included. */
  height: number;
  /** Outline colour. Defaults to `textDim`. */
  color?: ColorToken;
  /** The colour of whatever it stands on, which is what reads as hollow. Defaults to `bg`. */
  fill?: ColorToken;
  /** Outline weight in px. Defaults to 3. */
  thickness?: number;
  /** The column to fit, in px: a number too wide for it at `height` is drawn smaller. */
  maxWidth?: number;
  /** Names it to assistive tech. Left out inside a control that already says the number. */
  label?: string;
}

interface Placed {
  key: string;
  d: string;
  x: number;
}

function digitsOf(value: number): number[] {
  if (!Number.isFinite(value)) {
    return [];
  }
  return Array.from(String(Math.trunc(Math.abs(value)))).map(Number);
}

function place(value: number, height: number, thickness: number) {
  const scale = Math.max(height - thickness * 2, 0) / NUMERAL_BOX;
  const gap = height * TRACKING;
  const placed: Placed[] = [];
  let x = thickness;
  for (const [at, digit] of digitsOf(value).entries()) {
    const glyph = NUMERAL_GLYPHS[digit];
    if (!glyph) {
      continue;
    }
    placed.push({ key: `${at}:${digit}`, d: glyph.d, x });
    x += glyph.width * scale + gap;
  }
  const width = placed.length === 0 ? 0 : x - gap + thickness;
  return { placed, scale, width, height };
}

interface Fit {
  height: number;
  thickness: number;
  maxWidth?: number;
}

function fit(value: number, { height, thickness, maxWidth }: Fit) {
  const natural = place(value, height, thickness);
  if (maxWidth === undefined || natural.width <= maxWidth) {
    return natural;
  }
  const digits = digitsOf(value);
  const drawn = digits.reduce((sum, digit) => sum + (NUMERAL_GLYPHS[digit]?.width ?? 0), 0);
  const perHeight = drawn / NUMERAL_BOX + TRACKING * (digits.length - 1);
  const fixed = thickness * 2 - (thickness * 2 * drawn) / NUMERAL_BOX;
  return place(value, Math.max(Math.floor((maxWidth - fixed) / perHeight), 0), thickness);
}

interface DigitProps {
  d: string;
  x: number;
  scale: number;
  thickness: number;
  stroke: string;
  ground: string;
}

function Digit({ d, x, scale, thickness, stroke, ground }: Readonly<DigitProps>) {
  const at = `translate(${x} ${thickness}) scale(${scale})`;
  return (
    <G>
      <Path
        d={d}
        transform={at}
        fill="none"
        stroke={stroke}
        strokeWidth={(thickness * 2) / scale}
        strokeLinejoin="round"
      />
      <Path d={d} transform={at} fill={ground} />
    </G>
  );
}

/** How wide `<Numeral>` draws `value` at `height`, for a layout that has to
 * reserve its column before it is drawn. */
function numeralWidth(value: number, height: number, thickness = DEFAULT_THICKNESS): number {
  return Math.ceil(place(value, height, thickness).width);
}

/** The column that holds any single digit at `height`: the width of the widest
 * one. A row of ranks reserves this and passes it as `maxWidth`. */
function numeralColumn(height: number, thickness = DEFAULT_THICKNESS): number {
  return Math.max(...NUMERAL_GLYPHS.map((_, digit) => numeralWidth(digit, height, thickness)));
}

interface FigureProps {
  fitted: ReturnType<typeof fit>;
  thickness: number;
  stroke: string;
  ground: string;
  label?: string;
}

function Figure({ fitted, thickness, stroke, ground, label }: Readonly<FigureProps>) {
  const { placed, scale, width, height } = fitted;
  const box = Math.ceil(width);
  return (
    <View
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Svg width={box} height={height} viewBox={`0 0 ${box} ${height}`}>
        {placed.map((digit) => (
          <Digit
            key={digit.key}
            d={digit.d}
            x={digit.x}
            scale={scale}
            thickness={thickness}
            stroke={stroke}
            ground={ground}
          />
        ))}
      </Svg>
    </View>
  );
}

/**
 * A number drawn as outlines in the display face: the rank beside a poster in
 * a top ten. It is a shape rather than text, so it takes any height and looks
 * the same on a television, a phone and a browser.
 */
function Numeral({
  value,
  height,
  color = 'textDim',
  fill = 'bg',
  thickness = DEFAULT_THICKNESS,
  maxWidth,
  label,
}: Readonly<NumeralProps>) {
  const theme = activeTheme(useStyleScope().theme);
  const fitted = fit(value, { height, thickness, maxWidth });
  if (fitted.placed.length === 0 || fitted.scale === 0) {
    return null;
  }
  const stroke = resolve(color, theme);
  const ground = resolve(fill, theme);
  return (
    <Figure fitted={fitted} thickness={thickness} stroke={stroke} ground={ground} label={label} />
  );
}

export type { NumeralProps };
export { Numeral, numeralColumn, numeralWidth };
