import MaskedView from '@react-native-masked-view/masked-view';
import type { ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** Whether a page frame can mask what scrolls inside it: tvOS draws the mask on the GPU, Android would redraw the whole page through a bitmap. */
export const FRAME_MASKS = Platform.OS === 'ios';

const RAMP = 80;
const ROOM = 24;
const SHOWN = '#000';
const FRAME: ViewStyle = {
  flex: 1,
  minHeight: 0,
  marginHorizontal: -ROOM,
  paddingHorizontal: ROOM,
};
const FILL: ViewStyle = { flex: 1, backgroundColor: SHOWN };

function Ramp() {
  return (
    <Svg width="100%" height={RAMP}>
      <Defs>
        <LinearGradient id="frame-mask" x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} stopColor={SHOWN} stopOpacity={0} />
          <Stop offset={1} stopColor={SHOWN} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={RAMP} fill="url(#frame-mask)" />
    </Svg>
  );
}

/** A page frame that, while `active`, hides what scrolls above `inset` and fades it back in over the next 80 px: a real mask, so whatever is truly behind the page shows. A plain frame where it cannot mask. */
export function FrameMask({
  inset,
  active,
  children,
}: Readonly<{ inset: number; active: boolean; children: ReactNode }>): ReactNode {
  if (!FRAME_MASKS) return children;
  const mask = active ? (
    <View style={{ flex: 1 }}>
      <View style={{ height: inset }} />
      <Ramp />
      <View style={FILL} />
    </View>
  ) : (
    <View style={FILL} />
  );
  return (
    <MaskedView style={FRAME} maskElement={mask}>
      {children}
    </MaskedView>
  );
}
