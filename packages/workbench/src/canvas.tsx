// The canvas: where the component being inspected actually renders.
//
// Two things happen here that a plain gallery cannot do. The story renders
// inside a real VIEWPORT, so a component can be seen at the size the target
// gives it (a 1920x1080 television, a phone) rather than at whatever size the
// browser window happens to be. And the variant MATRIX is derived from the
// component's `sv`, so every option of every axis is on screen at once, and a
// variant added to the component appears here without anyone writing it down.

import { Box, type IconName, Txt } from '@kroma/ui/kit';
import { CANVAS, type ColorToken, colors, radius, shadow } from '@kroma/ui/tokens';
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView } from 'react-native';
import type { MatrixRow, StoryWidth } from './story';

/** A frame a story can be viewed in: what it is called, how it is pictured, how
 * big it is, and whether turning it is a thing anyone does. */
interface Viewport {
  label: string;
  glyph: IconName;
  /** `null` on `fit`: the component at its authored size, in whatever room the
   *  window leaves it. */
  size: { width: number; height: number } | null;
  /**
   * Both orientations are real for something held in a hand, so those frames
   * turn. A television has one orientation and a portrait one is a design nobody
   * ships, which is what "rotate if available" means here: the control is absent
   * on the frames where it would be a lie, rather than present and inert.
   */
  rotatable: boolean;
}

/** The frames a story can be viewed in. `fit` is the honest default: most
 * primitives are sized by their content and a device frame just adds letterbox.
 *
 * This is the ONE place the frames are described. The toolbar's menu, the frame
 * itself and the caption under it all read their name, their glyph and their
 * point size from here, so a frame added below appears in all three. */
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

/** The frame's points, turned a quarter if it is being viewed on its side. A
 * rotated frame is the SAME device, so the numbers swap rather than change. */
function frameSize(
  viewport: ViewportName,
  rotate: boolean,
): { width: number; height: number } | null {
  const size = VIEWPORTS[viewport]?.size;
  if (!size) return null;
  return rotate ? { width: size.height, height: size.width } : size;
}

/** Can this frame be turned? False for `fit`, which has no frame to turn, and
 * for the television. */
function canRotate(viewport: ViewportName): boolean {
  return VIEWPORTS[viewport]?.rotatable === true;
}

/**
 * How the stage lays a story out: the width to give it, and whether it has to
 * scroll to fit.
 *
 * There is a bug behind this, so it is a named, tested function rather than a
 * ternary at the call site. react-native-web implements `onLayout` with
 * `getBoundingClientRect`, which is POST-transform - so a component that MEASURES
 * ITSELF, placed inside a `scale(0.8)`, is told it has 880pt while its children
 * still lay out against 1100. <VirtualRail> derives its tile pitch, its scroll
 * offset and the position of its edge scrims from that number, and at 80% drew a
 * row built for an 880pt viewport into an 1100pt one: tiles sliced at the ends,
 * black scrims sitting over artwork instead of at the row's edges.
 *
 * So a story that says how wide it is never gets scaled. What it gets instead
 * depends on which of the three things it said (see `StoryWidth`):
 *
 *   'fill' / {}         the stage's own width. Dynamic: resize the window and the
 *                       component re-measures, which is the whole point.
 *   { min, max }        the same, clamped. Below `min` the stage SCROLLS rather
 *                       than measuring the component at a width no screen has.
 *   a number            that width, scrolling when the stage is narrower.
 *   absent              nothing to honour: the canvas measures the content and
 *                       `Fit` scales it down if it overflows.
 */
function stageWidth(
  spec: StoryWidth | undefined,
  available: number,
): { width?: number; scroll: boolean } {
  if (spec === undefined) return { scroll: false };
  // Not measured yet (jsdom, a first frame): asking for `available` would pin the
  // story to zero, so wait rather than commit to a width nothing can be laid out
  // in. The next layout pass has the real number.
  const room = available > 0 ? available : undefined;
  if (typeof spec === 'number') {
    return { width: spec, scroll: room !== undefined && spec > room };
  }
  const { min, max } = spec === 'fill' ? {} : spec;
  if (room === undefined) return { width: min, scroll: false };
  const capped = max === undefined ? room : Math.min(room, max);
  // `min` wins over the room available, and the overflow becomes a scroll: a grid
  // measured at 200pt would lay itself out as one column, which is not a design
  // anyone is trying to look at.
  const width = min === undefined ? capped : Math.max(capped, min);
  return { width, scroll: width > room };
}

/** Backgrounds worth checking a component against. A scrim that reads on the
 * page can vanish on a card, and that is a real bug the gallery used to hide. */
const SURFACES: ColorToken[] = ['bg', 'surface1', 'surface2'];

interface ViewportFrameProps {
  viewport: ViewportName;
  surface: ColorToken;
  pad: number;
  /** How much width the story asks for. See `StoryWidth` / `stageWidth`. */
  width?: StoryWidth;
  /** View the frame on its side. Ignored where the frame does not turn. */
  rotate?: boolean;
  /** Room between the story and the edge of its stage. The shell tightens this
   *  on a narrow window, where 32pt on each side is most of the canvas. */
  inset?: number;
  children: React.ReactNode;
}

/**
 * A box's own size, and the `onLayout` that keeps it up to date.
 *
 * The guard is the point: `onLayout` fires on every commit that touches the
 * subtree, and setting state to the size it already holds is a render loop with
 * extra steps. Both things on this canvas that measure themselves - the stage
 * area and the fit-scaler - want exactly this.
 */
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

/** The canvas's own annotations, joined the way a caption is read: left to
 * right, once. Absent parts drop out rather than leaving a stray dot. */
function captionText(parts: readonly (string | null | false)[]): string {
  return parts.filter(Boolean).join('  ·  ');
}

/** Renders children inside the chosen device frame, scaled to fit the space
 * available. Scaling is around the centre, exactly as `<TvStage>` does it, so
 * there is no transform-origin to get wrong. */
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
    // The room a story actually has on the stage card, inside its padding.
    const room = area.width ? area.width - (inset + pad) * 2 : 0;
    const stage = stageWidth(width, room);
    // No frame: the component sits on a stage card, elevated off the page so
    // its own surface (and the surface being tested) reads as a surface - and
    // scaled DOWN when it is wider than the card, so a 10-foot component is seen
    // whole instead of clipped at the edge. Same rule as a device frame: never
    // scale up, because a component blown past its authored size is a design
    // nobody ships.
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
          {/* A story that says how wide it is measures ITSELF, so it is given that
              width and never scaled - and the stage scrolls when the width it
              needs is more than the stage has. See `stageWidth`. */}
          <Staged stage={stage} room={room}>
            {children}
          </Staged>
        </Box>
      </ScrollView>
    );
  }

  // Never scale up: a 390pt phone blown up to fill a desktop window would show
  // a design nobody ships. The bezel is part of what has to fit, or a frame sized
  // to the window exactly would have its own casing clipped.
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
      {/* The measured box is this one and not the column above it: the caption
          has a height, and counting it as room for the frame is what would make
          a phone in a short window scale to something a few points too big. */}
      <Box flex center overflow="hidden" onLayout={onLayout}>
        {/* The casing. Without it the frame was invisible, and not by a little:
            the stage can be set to the SAME surface as the page behind it (that
            is what the `page` surface means), which left a hairline as the only
            thing saying where the viewport started - and that hairline is inside
            the scale transform, so at 72% zoom it was drawn 0.72px wide at 14%
            opacity. A casing lighter than every surface the stage can be set to
            fixes both: it is a real edge at any zoom and against any choice. */}
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
            // Counter-scaled, so the screen's own edge lands on one real pixel
            // whatever the zoom - which is what it never did before.
            style={[SCREEN, { borderWidth: hairline(scale) }]}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** The casing around the screen, in the frame's own points. */
const BEZEL = 10;

/**
 * A border width that comes out one real pixel AFTER the stage's scale.
 *
 * Everything inside the frame is scaled by a transform, borders included, so a
 * 1pt hairline on a frame shown at 40% is drawn four-tenths of a pixel wide and
 * the browser renders that as almost nothing. Dividing by the scale is what makes
 * the edge a constant on screen instead of a function of how much room the window
 * happened to have. Clamped, so a very small stage does not ask for a 6px border.
 */
function hairline(scale: number): number {
  return Math.min(3, 1 / Math.max(scale, 0.2));
}

/**
 * The story, laid out the way `stageWidth` decided: measured and scaled, given
 * its width, or given its width inside a sideways scroller.
 *
 * A component rather than a nested ternary at the call site, because these are
 * three different trees and reading which is which matters more here than
 * saving four lines.
 */
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

/**
 * What the canvas is currently showing, in points.
 *
 * One line, one shape, whichever frame is on: the frame's name, its size, and the
 * zoom when the window could not give it all of them. The zoom is not decoration
 * - a component being shown at 62% is something a reader has to know before
 * judging its type sizes or its hit targets - and neither is the size, which is
 * the difference between "the phone frame" and "390 x 844, which is an iPhone 14
 * and not the 360pt Android everyone actually has".
 *
 * The numbers are joined by a middle dot rather than laid out in columns because
 * this is a caption, not a table: it is read left to right, once, and then
 * ignored until the frame changes.
 */
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
  /** Does this frame have two orientations to be in? Saying "landscape" of a
   *  television, which has only ever been one, is noise. */
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

/**
 * Scales its child down to fit the width available, and says by how much.
 *
 * The canvas cannot know how wide a component wants to be - a 10-foot row is
 * 1000pt of fixed circles - so the content is measured at its NATURAL width first
 * (nothing constrains it, which is what `align="flex-start"` upstream is for) and
 * only then scaled. The scaled box takes the smaller footprint so the page does
 * not keep a huge scroll region behind a shrunken component.
 *
 * The measurement is not decoration: a component being shown at 68%, and how many
 * points wide it wanted to be, are both things a reader has to know before judging
 * its type sizes or its hit targets. It is worded and ordered like the device
 * frames' caption, because it is answering the same question about the same canvas
 * and two spellings of one answer is one to read twice.
 *
 * WHAT THIS MUST NOT BE USED ON, and it cost a rendering bug to learn: a component
 * that MEASURES ITSELF. react-native-web implements `onLayout` with
 * `getBoundingClientRect`, which is POST-transform, so inside a `scale(0.8)` a
 * component asking how wide it is gets 0.8 of the answer while its children still
 * lay out against the full width. <VirtualRail> computes its tile pitch, its
 * scroll offset and the position of its edge scrims from that number, so at 80%
 * it drew a row for an 880pt viewport into an 1100pt one: tiles sliced at the
 * edges, and black scrims sitting over artwork instead of at the row's ends.
 *
 * A story that measures itself is exactly the one that declares `width` (see
 * `StoryDef.width`: "for components that measure themselves"), so the stage
 * SCROLLS those sideways instead of scaling them - see the call site.
 */
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
        // The footprint is the SCALED size; the child inside keeps its own.
        w={scaled ? Math.round(wanted * scale) : undefined}
        h={scaled && natural.height ? Math.round(natural.height * scale) : undefined}
        style={SCALED_BOX}
      >
        {/* MEASURED here and TRANSFORMED one level in, which is three views for
            a reason. Measuring the transformed node is a loop: rnw's `onLayout`
            is `getBoundingClientRect`, which is post-transform, so a 1400pt
            component scaled to 64% reported 900 - at which point it fits, the
            scale drops to 1, it measures 1400 again, and the canvas flip-flops
            for as long as it is on screen. `alignSelf` is the other half: this
            node is a flex child of a box that is now only as wide as the SCALED
            content, and stretching to it would report the scaled width just as
            surely. Unstretched and untransformed, it reports what the component
            actually wants, once. */}
        <Box onLayout={measure} style={MEASURE}>
          <Box style={scaled ? { transform: [{ scale }], transformOrigin: '0 0' } : undefined}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** One voice for the canvas's own annotations: the frame caption and the
 * fit-scaler's zoom are the same remark about the same canvas. */
const CAPTION = { fontSize: 11, opacity: 0.75 } as const;
/** The scaled child overflows its own footprint before the transform lands, so
 * the box must not clip it while it settles. */
const SCALED_BOX = { overflow: 'visible' } as const;
/** The measured node: its own natural width, never the parent's. See `Fit`. */
const MEASURE = { alignSelf: 'flex-start' } as const;

const SCROLL = { flex: 1 } as const;
/** The sideways scroller a story too wide for the stage gets instead of a scale.
 * `alignSelf: stretch` so it takes the stage's width and scrolls WITHIN it - left
 * to hug its content it would grow to the story's width and overflow the card. */
const SCROLL_X = { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' } as const;
const STAGE_AREA = { alignItems: 'stretch' } as const;
// `borderStrong` rather than `border`, for the same reason the device frame has
// a casing: the stage can be set to the page's own colour, and at 8% a card with
// no other edge simply is not there.
const STAGE = {
  borderWidth: 1,
  borderColor: colors.borderStrong,
  minHeight: 220,
  alignSelf: 'stretch',
} as const;
// The casing reads as an object on the page: a lit edge above it, and a real
// shadow under it. Both are inside the scale transform, which is fine for a
// shadow (it is soft, and softer at 40% is still a shadow) and is exactly why
// the border width is counter-scaled instead of written here.
const CASE = { borderColor: colors.borderStrong, boxShadow: shadow.pop } as const;
const SCREEN = { borderColor: colors.border } as const;

interface MatrixProps {
  rows: readonly MatrixRow[];
  args: Record<string, unknown>;
  render: (args: Record<string, unknown>) => React.ReactNode;
}

/**
 * One labelled row per variant group, holding every other axis at its current
 * value. That is deliberately not the full cartesian product: the product of
 * four groups is hundreds of cells nobody reads, whereas one row per axis
 * answers the question actually being asked, which is "what does THIS axis do".
 * The other axes stay live on the controls, so any combination is still one
 * click away.
 */
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
