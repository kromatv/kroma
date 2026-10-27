import MaskedView from '@react-native-masked-view/masked-view';
import { type ReactNode, useContext, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ScrollPositionContext } from '#ui/lib/scroll-position';

const RAMP = 160;
const MASKED = Platform.OS === 'ios';
const PROBE: ViewStyle = { position: 'absolute', top: 0, left: 0, width: 0, height: 0 };
const OPAQUE = '#000';

interface Frame {
  top: number;
  height: number;
}

function Ramp() {
  return (
    <Svg width="100%" height={RAMP}>
      <Defs>
        <LinearGradient id="scroll-mask" x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} stopColor={OPAQUE} stopOpacity={0} />
          <Stop offset={1} stopColor={OPAQUE} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={RAMP} fill="url(#scroll-mask)" />
    </Svg>
  );
}

/** Content inside a page scroller that dissolves to transparent as it scrolls up past `inset` below the scroller's top edge, over the next 160 px: a real mask, so whatever is truly behind it shows. Android draws it unmasked. */
export function ScrollMask({
  inset,
  style,
  children,
}: Readonly<{ inset: number; style?: StyleProp<ViewStyle>; children: ReactNode }>) {
  const position = useContext(ScrollPositionContext);
  const probe = useRef<View>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  if (!MASKED || !position) return <View style={style}>{children}</View>;

  const measure = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    const content = position.content.current;
    if (!probe.current || !content) return;
    probe.current.measureLayout(
      content,
      (_left, top) =>
        setFrame((was) => (was?.top === top && was.height === height ? was : { top, height })),
      () => {},
    );
  };

  const mask = frame ? (
    <Animated.View
      style={{ transform: [{ translateY: Animated.add(position.offset, inset - frame.top) }] }}
    >
      <Ramp />
      <View
        style={{ height: frame.height + Math.max(0, frame.top - inset), backgroundColor: OPAQUE }}
      />
    </Animated.View>
  ) : (
    <View style={{ flex: 1, backgroundColor: OPAQUE }} />
  );

  return (
    <MaskedView style={style} maskElement={mask} onLayout={measure}>
      <View ref={probe} style={PROBE} pointerEvents="none" />
      {children}
    </MaskedView>
  );
}
