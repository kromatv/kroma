import { type ReactNode, useContext, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '#ui/core/tokens';
import { splitBoxLayers } from '#ui/lib/box-layers';
import { GPU_MASKS, PAGE_MASKS } from '#ui/lib/gpu-masks';
import { ScrollPositionContext } from '#ui/lib/scroll-position';
import { StableMaskedView } from '#ui/lib/stable-masked-view';

const RAMP = 80;
// Where a mask the size of a page is costly: Evas draws every rounded clip
// under it into a surface of its own on each frame the page scrolls.
const COVERS = GPU_MASKS && !PAGE_MASKS;
const COVER_CLIP: ViewStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  overflow: 'hidden',
  zIndex: 10,
};
const MASKED = GPU_MASKS;
const PROBE: ViewStyle = { position: 'absolute', top: 0, left: 0, width: 0, height: 0 };
const OPAQUE = '#000';
const REMEASURE_MS = 120;
const ROOM = 24;
const SIZES = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const;

const pad = (value: unknown): number => (typeof value === 'number' ? value : 0);

function withRoom(box: ViewStyle | undefined, face: StyleProp<ViewStyle>) {
  const b: ViewStyle = { ...box };
  const f: ViewStyle = { ...StyleSheet.flatten(face) };
  const grown: ViewStyle = {};
  for (const key of SIZES) {
    const size = b[key];
    if (typeof size === 'number') grown[key] = size + ROOM * 2;
  }
  return {
    box: {
      ...b,
      ...grown,
      marginTop: pad(b.marginTop ?? b.marginVertical ?? b.margin) - ROOM,
      marginBottom: pad(b.marginBottom ?? b.marginVertical ?? b.margin) - ROOM,
      marginLeft: pad(b.marginLeft ?? b.marginHorizontal ?? b.margin) - ROOM,
      marginRight: pad(b.marginRight ?? b.marginHorizontal ?? b.margin) - ROOM,
    },
    face: {
      ...f,
      paddingTop: pad(f.paddingTop ?? f.paddingVertical ?? f.padding) + ROOM,
      paddingBottom: pad(f.paddingBottom ?? f.paddingVertical ?? f.padding) + ROOM,
      paddingLeft: pad(f.paddingLeft ?? f.paddingHorizontal ?? f.padding) + ROOM,
      paddingRight: pad(f.paddingRight ?? f.paddingHorizontal ?? f.padding) + ROOM,
    },
  };
}

interface Frame {
  top: number;
  height: number;
}

function CoverRamp({ inset }: Readonly<{ inset: number }>) {
  const height = inset + RAMP;
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <LinearGradient
          id="scroll-cover"
          x1="0"
          y1="0"
          x2="0"
          y2={height}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset={inset / height} stopColor={colors.bg} stopOpacity={1} />
          <Stop offset={1} stopColor={colors.bg} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={height} fill="url(#scroll-cover)" />
    </Svg>
  );
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

/** Content inside a page scroller that dissolves to transparent as it scrolls up past `inset` below the scroller's top edge, over the next 80 px: a real mask, so whatever is truly behind it shows. Android draws it unmasked. `ground` says nothing but the ground colour lies behind the content, so a platform where a page-sized mask is costly fades it under a cover of that colour instead. */
export function ScrollMask({
  inset,
  ground = false,
  style,
  children,
}: Readonly<{
  inset: number;
  ground?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}>) {
  const position = useContext(ScrollPositionContext);
  const probe = useRef<View>(null);
  const height = useRef(0);
  const [frame, setFrame] = useState<Frame | null>(null);

  const measure = () => {
    const content = position?.content.current;
    if (!probe.current || !content) return;
    probe.current.measureLayout(
      content,
      (_left, top) =>
        setFrame((was) =>
          was?.top === top && was.height === height.current ? was : { top, height: height.current },
        ),
      () => {},
    );
  };
  const remeasure = useEffectEvent(measure);

  useEffect(() => {
    if (!MASKED || !position) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const id = position.offset.addListener(() => {
      timer ??= setTimeout(() => {
        timer = null;
        remeasure();
      }, REMEASURE_MS);
    });
    return () => {
      position.offset.removeListener(id);
      if (timer) clearTimeout(timer);
    };
  }, [position]);

  if (!MASKED || !position) return <View style={style}>{children}</View>;

  const onLayout = (e: LayoutChangeEvent) => {
    height.current = e.nativeEvent.layout.height;
    measure();
  };

  if (COVERS && ground) {
    return (
      <View style={style} onLayout={onLayout}>
        <View ref={probe} style={PROBE} pointerEvents="none" />
        {children}
        {frame ? (
          <View style={COVER_CLIP} pointerEvents="none">
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: inset + RAMP,
                transform: [{ translateY: Animated.add(position.offset, -frame.top) }],
              }}
            >
              <CoverRamp inset={inset} />
            </Animated.View>
          </View>
        ) : null}
      </View>
    );
  }

  const split = splitBoxLayers(style);
  const layers = withRoom(split.box, split.face);

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
    <StableMaskedView
      style={layers.box}
      contentStyle={layers.face}
      maskElement={mask}
      onLayout={onLayout}
    >
      <View ref={probe} style={PROBE} pointerEvents="none" />
      {children}
    </StableMaskedView>
  );
}
