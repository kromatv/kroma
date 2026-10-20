import { type ReactNode, useState } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { maskImage } from '#ui/lib/css';

const RAMP = 48;
const FILL: ViewStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  pointerEvents: 'none',
};

/** A copy of the backdrop over the top edge: it hides scrolled content above `inset` and fades it back in over the next 48 px. Nothing on native, which has no mask. */
export function TopFadeBand({ inset, children }: Readonly<{ inset: number; children: ReactNode }>) {
  const [height, setHeight] = useState(0);
  const band: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: inset + RAMP,
    overflow: 'hidden',
    pointerEvents: 'none',
    ...maskImage(`linear-gradient(180deg, #000 ${inset}px, transparent ${inset + RAMP}px)`),
  };
  return (
    <View style={FILL} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 ? (
        <View style={band}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
            {children}
          </View>
        </View>
      ) : null}
    </View>
  );
}
