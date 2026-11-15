import { useCallback, useRef, useState } from 'react';
import type { ImageStyle, LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { activeTheme, color, styles, sv, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { type CropPlacement, type PixelSize, placeImage } from '#ui/lib/crop-geometry';
import { useCropKeys } from '#ui/lib/crop-keys';
import { GESTURE_SURFACE } from '#ui/lib/gesture-surface';
import { Circle, Path, Svg } from '#ui/lib/svg';
import { useImageBackend } from '#ui/lib/image-backend';
import { useWheelTravel } from '#ui/lib/wheel-pan';
import { type CropperState, useCropperPart } from './cropper-context';
import { useCropGestures } from './cropper-gestures';

const NUDGE = 0.02;
const ZOOM_STEP = 0.1;
const WHEEL_ZOOM = 0.001;

const sDefinition = styles({
  still: { touchAction: 'none', userSelect: 'none', cursor: 'grab' },
  dragging: { touchAction: 'none', userSelect: 'none', cursor: 'grabbing' },
});

const WHOLE: ImageStyle = { width: '100%', height: '100%' };

const percent = (fraction: number) => `${fraction * 100}%` as const;

function placedStyle(placed: CropPlacement, rotation: number): ViewStyle {
  return {
    left: percent(placed.left),
    top: percent(placed.top),
    width: percent(placed.width),
    height: percent(placed.height),
    transform: [{ rotate: `${rotation}deg` }],
  };
}

function Picture({ cropper }: Readonly<{ cropper: CropperState }>) {
  const { src, image, transform, aspect } = cropper;
  const backend = useImageBackend();
  if (!src) {
    return null;
  }
  const placed = image ? placeImage(image, transform, aspect) : null;
  const picture = backend.render({
    uri: src,
    fit: placed ? 'stretch' : 'cover',
    fadeMs: 0,
    style: WHOLE,
  });
  return placed ? (
    <Box absolute pointerEvents="none" style={placedStyle(placed, transform.rotation)}>
      {picture}
    </Box>
  ) : (
    <Box fill pointerEvents="none">
      {picture}
    </Box>
  );
}

function CircleDim({ box }: Readonly<{ box: PixelSize }>) {
  const theme = activeTheme(useStyleScope().theme);
  const { width, height } = box;
  const radius = Math.min(width, height) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const hole = `M${cx - radius} ${cy}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z`;
  return (
    <Box fill pointerEvents="none">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={`M0 0H${width}V${height}H0Z${hole}`}
          fillRule="evenodd"
          fill={color('bg/70', theme)}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={radius - 0.5}
          fill="none"
          stroke={color('tint/40', theme)}
          strokeWidth={1}
        />
      </Svg>
    </Box>
  );
}

interface CropperFrameProps {
  /** Names the frame to assistive tech, `Crop` by default. */
  label?: string;
  /** The frame takes its container's width and its height from the Root's `aspect`; cap it here. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The stage: the picture behind a clipped box of the Root's `aspect`. Drag
 * pans, the wheel and a pinch zoom. The whole frame is one focus stop: press it
 * to take the arrow keys and plus and minus, press it again to give them back.
 */
function Frame({ label = 'Crop', style }: Readonly<CropperFrameProps>) {
  const s = useStyles(sDefinition);
  const cropper = useCropperPart('Frame');
  const { panBy, zoomBy } = cropper;

  const [held, setHeld] = useState(false);
  const release = useCallback(() => setHeld(false), []);
  useCropKeys({
    held,
    onPan: (x, y) => panBy(x * NUDGE, y * NUDGE),
    onZoom: (towards) => zoomBy(towards * ZOOM_STEP),
    onRelease: release,
  });

  const [box, setBox] = useState<PixelSize | null>(null);
  const measure = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox(width > 0 && height > 0 ? { width, height } : null);
  }, []);

  const surface = useRef<View>(null);
  const onWheel = useCallback((delta: number) => zoomBy(-delta * WHEEL_ZOOM), [zoomBy]);
  useWheelTravel(surface, onWheel, cropper.src !== null);
  const { handlers, dragging } = useCropGestures(cropper, box);

  return (
    <Box w="100%" aspect={cropper.aspect} style={style}>
      <Focusable
        label={label}
        pressed={held}
        disabled={cropper.src === null}
        focusScale={1}
        sv={frame}
        vars={{ held }}
        onPress={() => setHeld((was) => !was)}
        onBlur={release}
      >
        <Box
          ref={surface}
          fill
          {...handlers}
          {...GESTURE_SURFACE}
          onLayout={measure}
          style={dragging ? s.dragging : s.still}
        >
          <Picture cropper={cropper} />
          {cropper.shape === 'circle' && box ? <CircleDim box={box} /> : null}
        </Box>
      </Focusable>
    </Box>
  );
}

const frame = sv({
  slots: {
    root: { flex: true, overflow: 'hidden', radius: 'lg', bg: 'surface1', border: 'border' },
  },
  variants: {
    held: {
      true: { root: { border: 'accent' } },
    },
  },
  defaults: { held: false },
});

export type { CropperFrameProps };
export { Frame };
