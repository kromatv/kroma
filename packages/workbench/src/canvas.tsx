// Where the component being inspected renders: inside a device viewport, and as
// a variant matrix derived from the component's `sv`.

import { Box, type IconName, Txt } from '@kroma/ui/kit';
import { CANVAS, type ColorToken, colors, radius, shadow } from '@kroma/ui/tokens';
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView } from 'react-native';
import type { MatrixRow, StoryWidth } from './story';

interface Viewport {
  label: string;
  glyph: IconName;
  // `null` on `fit`: the component at its authored size.
  size: { width: number; height: number } | null;
  rotatable: boolean;
}

// The frames a story can be viewed in; the toolbar menu, the frame and its
// caption all read from here.
const VIEWPORTS: Record<string, Viewport> = {
  fit: { label: 'Fit', glyph: 'frame', size: null, rotatable: false },
  tv: {
    label: 'TV',
    glyph: 'device-tv',
    size: { width: CANVAS.width, height: CANVAS.height },
    rotatable: false,
  },
  phone: {
    label: 'Phone',
    glyph: 'device-mobile',
    size: { width: 390, height: 844 },
    rotatable: true,
  },
  tablet: {
    label: 'Tablet',
    glyph: 'device-ipad',
    size: { width: 834, height: 1112 },
    rotatable: true,
  },
};

type ViewportName = 'fit' | 'tv' | 'phone' | 'tablet';

function frameSize(
  viewport: ViewportName,
  rotate: boolean,
): { width: number; height: number } | null {
  const size = VIEWPORTS[viewport]?.size;
  if (!size) return null;
  return rotate ? { width: size.height, height: size.width } : size;
}

function canRotate(viewport: ViewportName): boolean {
  return VIEWPORTS[viewport]?.rotatable === true;
}

// The width to give a story and whether the stage has to scroll to fit it. A story that
// declares a width is never scaled: react-native-web implements `onLayout` with
// `getBoundingClientRect`, which is post-transform, so a self-measuring component inside a
// `scale(0.8)` reads 0.8 of its real width while its children lay out against the full one.
function stageWidth(
  spec: StoryWidth | undefined,
  available: number,
): { width?: number; scroll: boolean } {
  if (spec === undefined) return { scroll: false };
  // Not measured yet (jsdom, a first frame): using `available` would pin the
  // story to zero. The next layout pass has the real number.
  const room = available > 0 ? available : undefined;
  if (typeof spec === 'number') {
    return { width: spec, scroll: room !== undefined && spec > room };
  }
  const { min, max } = spec === 'fill' ? {} : spec;
  if (room === undefined) return { width: min, scroll: false };
  const capped = max === undefined ? room : Math.min(room, max);
  // `min` wins over the room available, and the overflow becomes a scroll.
  const width = min === undefined ? capped : Math.max(capped, min);
  return { width, scroll: width > room };
}

const SURFACES: ColorToken[] = ['bg', 'surface1', 'surface2'];

interface ViewportFrameProps {
  viewport: ViewportName;
  surface: ColorToken;
  pad: number;
  width?: StoryWidth;
  rotate?: boolean;
  inset?: number;
  children: React.ReactNode;
}

// The identity guard matters: `onLayout` fires on every commit touching the
// subtree, and re-setting the same size is a render loop.
function useMeasuredSize(): [
  { width: number; height: number },
  (event: LayoutChangeEvent) => void,
] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);
  return [size, onLayout];
}

function captionText(parts: readonly (string | null | false)[]): string {
  return parts.filter(Boolean).join('  ·  ');
}

// Renders children inside the chosen device frame, scaled to fit the space available.
function ViewportFrame({
  viewport,
  surface,
  pad,
  width,
  rotate = false,
  inset = 32,
  children,
}: Readonly<ViewportFrameProps>) {
  const [area, onLayout] = useMeasuredSize();
  const device = frameSize(viewport, rotate && canRotate(viewport));

  if (!device) {
    const room = area.width ? area.width - (inset + pad) * 2 : 0;
    const stage = stageWidth(width, room);
    // No frame: the component sits on a stage card, scaled down when wider than
    // the card. Never scaled up, as with a device frame.
    return (
      <ScrollView
        style={SCROLL}
        contentContainerStyle={[STAGE_AREA, { padding: Math.round(inset * 0.75) }]}
      >
        <Box
          bg={surface}
          radius="xl"
          p={inset + pad}
          align="flex-start"
          style={STAGE}
          onLayout={onLayout}
        >
          {/* See `stageWidth`. */}
          <Staged stage={stage} room={room}>
            {children}
          </Staged>
        </Box>
      </ScrollView>
    );
  }

  // Never scale up, and count the bezel as part of what has to fit.
  const outer = { width: device.width + BEZEL * 2, height: device.height + BEZEL * 2 };
  const scale = Math.min(
    1,
    area.width ? (area.width - 64) / outer.width : 1,
    area.height ? (area.height - 64) / outer.height : 1,
  );

  return (
    <Box flex>
      <Caption
        label={VIEWPORTS[viewport]?.label ?? viewport}
        size={device}
        scale={scale}
        inset={inset}
        oriented={canRotate(viewport)}
      />
      {/* Measured here and not on the column above: the caption has a height,
          and counting it as room for the frame oversizes the frame. */}
      <Box flex center overflow="hidden" onLayout={onLayout}>
        {/* The casing marks where the viewport starts even when the stage is set
            to the same surface as the page behind it. */}
        <Box
          bg="surface3"
          p={BEZEL}
          radius={radius.lg + BEZEL}
          style={[CASE, { transform: [{ scale }], borderWidth: hairline(scale) }]}
        >
          <Box
            w={device.width}
            h={device.height}
            bg={surface}
            overflow="hidden"
            p={pad}
            radius="lg"
            style={[SCREEN, { borderWidth: hairline(scale) }]}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const BEZEL = 10;

// A border width that comes out one real pixel after the stage's scale transform, clamped so a
// very small stage does not ask for a 6px border.
function hairline(scale: number): number {
  return Math.min(3, 1 / Math.max(scale, 0.2));
}

function Staged({
  stage,
  room,
  children,
}: Readonly<{
  stage: { width?: number; scroll: boolean };
  room: number;
  children: React.ReactNode;
}>) {
  if (stage.width === undefined) return <Fit available={room}>{children}</Fit>;
  const sized = <Box w={stage.width}>{children}</Box>;
  if (!stage.scroll) return sized;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={SCROLL_X}>
      {sized}
    </ScrollView>
  );
}

function Caption({
  label,
  size,
  scale,
  inset,
  oriented,
}: Readonly<{
  label: string;
  size: { width: number; height: number };
  scale: number;
  inset: number;
  oriented: boolean;
}>) {
  const orientation = size.width > size.height ? 'landscape' : 'portrait';
  return (
    <Box row align="center" px={Math.round(inset * 0.75)} pt={12}>
      <Txt variant="meta" color="textDim" style={CAPTION}>
        {captionText([
          label,
          `${size.width} × ${size.height}`,
          oriented && orientation,
          scale < 1 && `${Math.round(scale * 100)}%`,
        ])}
      </Txt>
    </Box>
  );
}

// Scales its child down to fit the width available, and says by how much.
//
// Must not be used on a component that measures itself: react-native-web's
// `onLayout` is `getBoundingClientRect`, which is post-transform, so inside a
// `scale(0.8)` it reads 0.8 of its real width while its children lay out
// against the full one. Those stories declare `width` and the stage scrolls
// them instead.
function Fit({ available, children }: Readonly<{ available: number; children: React.ReactNode }>) {
  const [natural, measure] = useMeasuredSize();

  const wanted = natural.width;
  const scale = available > 0 && wanted > available ? available / wanted : 1;
  const scaled = scale < 1;

  return (
    <Box gap={scaled ? 10 : 0} align="flex-start">
      {scaled ? (
        <Txt variant="meta" color="textDim" style={CAPTION}>
          {captionText([
            'Fit',
            `${Math.round(wanted)} × ${Math.round(natural.height)}`,
            `${Math.round(scale * 100)}%`,
          ])}
        </Txt>
      ) : null}
      <Box
        w={scaled ? Math.round(wanted * scale) : undefined}
        h={scaled && natural.height ? Math.round(natural.height * scale) : undefined}
        style={SCALED_BOX}
      >
        {/* Measured here, transformed one level in: measuring the transformed
            node loops, since rnw's `onLayout` is post-transform. Unstretched
            (`alignSelf`) so it reports the natural width, not the scaled one. */}
        <Box onLayout={measure} style={MEASURE}>
          <Box style={scaled ? { transform: [{ scale }], transformOrigin: '0 0' } : undefined}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const CAPTION = { fontSize: 11, opacity: 0.75 } as const;
const SCALED_BOX = { overflow: 'visible' } as const;
const MEASURE = { alignSelf: 'flex-start' } as const;

const SCROLL = { flex: 1 } as const;
// `alignSelf: stretch` so the scroller takes the stage's width and scrolls
// within it; hugging its content it would grow and overflow the card.
const SCROLL_X = { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' } as const;
const STAGE_AREA = { alignItems: 'stretch' } as const;
const STAGE = {
  borderWidth: 1,
  borderColor: colors.borderStrong,
  minHeight: 220,
  alignSelf: 'stretch',
} as const;
const CASE = { borderColor: colors.borderStrong, boxShadow: shadow.pop } as const;
const SCREEN = { borderColor: colors.border } as const;

interface MatrixProps {
  rows: readonly MatrixRow[];
  args: Record<string, unknown>;
  render: (args: Record<string, unknown>) => React.ReactNode;
}

// One labelled row per variant group, every other axis held at its current value — deliberately
// not the full cartesian product.
function Matrix({ rows, args, render }: Readonly<MatrixProps>) {
  if (rows.length === 0) {
    return (
      <Txt variant="meta" color="textDim">
        This component declares no variants.
      </Txt>
    );
  }
  return (
    <Box gap={36}>
      {rows.map((row) => (
        <Box key={row.group} gap={14}>
          <Box row align="center" gap={12}>
            <Txt variant="overline" color="accent">
              {row.group}
            </Txt>
            <Box flex h={1} bg={colors.border} />
          </Box>
          <Box row wrap gap={24} align="flex-start">
            {row.options.map((option) => (
              <Box key={String(option)} gap={10} align="flex-start">
                {render({ ...args, [row.group]: option })}
                <Txt variant="meta" color="textDim" style={CELL_LABEL}>
                  {String(option)}
                </Txt>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

const CELL_LABEL = { fontSize: 11.5 } as const;

export type { MatrixProps, Viewport, ViewportFrameProps, ViewportName };
export { canRotate, frameSize, hairline, Matrix, SURFACES, stageWidth, VIEWPORTS, ViewportFrame };
