// Where the component being inspected renders: inside a device viewport, and as
// a variant matrix derived from the component's `sv`. The frame table and the
// arithmetic under all of it are in `viewport.ts`.

import { Box, styles, Text, useTheme } from '@kroma/ui/kit';
import { type ColorToken, colors, nestedRadius } from '@kroma/ui/tokens';
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView } from 'react-native';
import type { MatrixRow } from './derive';
import type { StoryWidth } from './story';
import {
  BEZEL,
  canRotate,
  frameSize,
  hairline,
  stageWidth,
  VIEWPORTS,
  type ViewportName,
} from './viewport';

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
  const theme = useTheme();
  const device = frameSize(viewport, rotate && canRotate(viewport));

  if (!device) {
    const room = area.width ? area.width - (inset + pad) * 2 : 0;
    const stage = stageWidth(width, room);
    // No frame: the component sits on a stage card, scaled down when wider than
    // the card. Never scaled up, as with a device frame.
    return (
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.stageArea, { padding: Math.round(inset * 0.75) }]}
      >
        <Box
          bg={surface}
          radius="xl"
          p={inset + pad}
          align="flex-start"
          style={s.stage}
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
          radius={nestedRadius(theme.radius.lg, -BEZEL)}
          style={[s.case, { transform: [{ scale }], borderWidth: hairline(scale) }]}
        >
          <Box
            w={device.width}
            h={device.height}
            bg={surface}
            overflow="hidden"
            p={pad}
            radius="lg"
            style={[s.screen, { borderWidth: hairline(scale) }]}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
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
    <ScrollView horizontal showsHorizontalScrollIndicator style={s.scrollX}>
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
      <Text variant="meta" color="textDim" style={s.caption}>
        {captionText([
          label,
          `${size.width} × ${size.height}`,
          oriented && orientation,
          scale < 1 && `${Math.round(scale * 100)}%`,
        ])}
      </Text>
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
        <Text variant="meta" color="textDim" style={s.caption}>
          {captionText([
            'Fit',
            `${Math.round(wanted)} × ${Math.round(natural.height)}`,
            `${Math.round(scale * 100)}%`,
          ])}
        </Text>
      ) : null}
      <Box
        w={scaled ? Math.round(wanted * scale) : undefined}
        h={scaled && natural.height ? Math.round(natural.height * scale) : undefined}
        style={s.scaledBox}
      >
        {/* Measured here, transformed one level in: measuring the transformed
            node loops, since rnw's `onLayout` is post-transform. Unstretched
            (`alignSelf`) so it reports the natural width, not the scaled one. */}
        <Box onLayout={measure} style={s.measure}>
          <Box style={scaled ? { transform: [{ scale }], transformOrigin: '0 0' } : undefined}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

interface MatrixProps {
  rows: readonly MatrixRow[];
  args: Record<string, unknown>;
  render: (args: Record<string, unknown>) => React.ReactNode;
}

// One labelled row per variant group, every other axis held at its current value, deliberately
// not the full cartesian product.
function Matrix({ rows, args, render }: Readonly<MatrixProps>) {
  if (rows.length === 0) {
    return (
      <Text variant="meta" color="textDim">
        This component declares no variants.
      </Text>
    );
  }
  return (
    <Box gap={36}>
      {rows.map((row) => (
        <Box key={row.group} gap={14}>
          <Box row align="center" gap={12}>
            <Text variant="overline" color="accent">
              {row.group}
            </Text>
            <Box flex h={1} bg={colors.border} />
          </Box>
          <Box row wrap gap={24} align="flex-start">
            {row.options.map((option) => (
              <Box key={String(option)} gap={10} align="flex-start">
                {render({ ...args, [row.group]: option })}
                <Text variant="meta" color="textDim" style={s.cellLabel}>
                  {String(option)}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

const s = styles({
  caption: { fontSize: 11, opacity: 0.75 },
  scaledBox: { overflow: 'visible' },
  measure: { self: 'flex-start' },
  scroll: { flex: true },
  // `self: stretch` so the scroller takes the stage's width and scrolls within
  // it; hugging its content it would grow and overflow the card.
  scrollX: { grow: 0, shrink: 1, self: 'stretch' },
  stageArea: { align: 'stretch' },
  stage: { border: 'borderStrong', minH: 220, self: 'stretch' },
  case: { borderColor: 'borderStrong', shadow: 'pop' },
  screen: { borderColor: 'border' },
  cellLabel: { fontSize: 11.5 },
});

export { Matrix, ViewportFrame };
