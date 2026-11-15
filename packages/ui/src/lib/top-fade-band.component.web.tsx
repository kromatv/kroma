import { type ReactNode, useState } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { colors } from '#ui/core/tokens';
import { gradient, maskImage } from '#ui/lib/css';

const RAMP = 80;
const FILL: ViewStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  pointerEvents: 'none',
};
const FADE = {
  transitionProperty: 'opacity',
  transitionDuration: '200ms',
  willChange: 'opacity',
} as ViewStyle;

/** Whether page content can mask itself here (see `ScrollMask`), so a screen that does needs no band. */
export const CONTENT_MASKS = true;

/** A copy of the backdrop over the top edge: while `active`, it hides scrolled content above `inset` and fades it back in over the next 80 px. `offset` is how far below the backdrop's origin the band's parent sits; no `children` fades to the ground colour. */
export function TopFadeBand({
  inset,
  active,
  offset = 0,
  children,
}: Readonly<{ inset: number; active: boolean; offset?: number; children?: ReactNode }>) {
  const [height, setHeight] = useState(0);
  const ramp = `180deg, #000 ${inset}px, transparent ${inset + RAMP}px`;
  const band: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: inset + RAMP,
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: active ? 1 : 0,
    ...FADE,
  };
  if (!children) {
    return (
      <View
        style={{
          ...band,
          ...gradient(
            `linear-gradient(180deg, ${colors.bg} ${inset}px, transparent ${inset + RAMP}px)`,
          ),
        }}
      />
    );
  }
  return (
    <View style={FILL} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 ? (
        <View style={{ ...band, ...maskImage(`linear-gradient(${ramp})`) }}>
          <View
            style={{
              position: 'absolute',
              top: -offset,
              left: 0,
              right: 0,
              height: height + offset,
              backgroundColor: colors.bg,
            }}
          >
            {children}
          </View>
        </View>
      ) : null}
    </View>
  );
}
