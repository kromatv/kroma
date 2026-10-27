import MaskedView from '@react-native-masked-view/masked-view';
import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '#ui/core/tokens';

const RAMP = 80;
const FILL: ViewStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  pointerEvents: 'none',
};

function Ramp({ inset, color }: Readonly<{ inset: number; color: string }>) {
  const height = inset + RAMP;
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <LinearGradient
          id="top-fade"
          x1="0"
          y1="0"
          x2="0"
          y2={height}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset={inset / height} stopColor={color} stopOpacity={1} />
          <Stop offset={1} stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={height} fill="url(#top-fade)" />
    </Svg>
  );
}

/** Whether page content can mask itself here (see `ScrollMask`), so a screen that does needs no band. */
export const CONTENT_MASKS = false;

/** A copy of the backdrop over the top edge: while `active`, it hides scrolled content above `inset` and fades it back in over the next 80 px. `offset` is how far below the backdrop's origin the band's parent sits; no `children` fades to the ground colour. */
export function TopFadeBand({
  inset,
  active,
  offset = 0,
  children,
}: Readonly<{ inset: number; active: boolean; offset?: number; children?: ReactNode }>) {
  const [height, setHeight] = useState(0);
  const band: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: inset + RAMP,
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: active ? 1 : 0,
  };
  if (!children) {
    return (
      <View style={band}>
        <Ramp inset={inset} color={colors.bg} />
      </View>
    );
  }
  return (
    <View style={FILL} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 ? (
        <MaskedView style={band} maskElement={<Ramp inset={inset} color="#000" />}>
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
        </MaskedView>
      ) : null}
    </View>
  );
}
