import type { Translate } from '@kromatv/i18n';
import { memo, type ReactNode, type Ref, useMemo, useState } from 'react';
import { Animated, Pressable, useWindowDimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Veil } from '#ui/components/atoms/veil';
import { cellWidth } from '#ui/components/atoms/grid';
import { Text } from '#ui/components/atoms/text';
import type { PanelHandle } from '#ui/components/organisms/player/lib/nav';
import { FOCUS_SCALE, playerStyle } from '#ui/components/organisms/player/lib/style';
import { VIRTUAL_FOCUS } from '#ui/lib/player/virtual-focus';
import {
  UP_NEXT_COLUMNS,
  UP_NEXT_GAP,
  UpNextCard,
  type UpNextItem,
} from '#ui/components/organisms/player/parts/up-next-card';
import { RING_ROOM, styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { maskImage } from '#ui/lib/css';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { FocusColumn, FocusRegion, FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { FocusScroll } from '#ui/lib/focus-scroll';
import { useT } from '#ui/services/i18n';
import { SheetHeader } from './sheet-header';
import { SheetKeys } from './sheet-keys';
import { useSheetSlide } from '#ui/lib/player/sheet-slide';

export type { UpNextItem };

export interface UpNextData {
  nextEpisodes: UpNextItem[];
  recommendations: UpNextItem[];
}

export interface UpNextSheetProps {
  data: UpNextData;
  open: boolean;
  revealed: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPlay: (item: UpNextItem) => void;
  ref?: Ref<PanelHandle>;
}

// The player's bottom chrome has to clear exactly this much (see Player.tsx).
export const PEEK_HEIGHT = 150;
const SHEET_FRACTION = 0.82;

// In pixels, never a percentage string: react-native-web resolves a percentage
// transform against the element's own box and native React Native cannot
// interpret one at all, so the sheet would never park on Apple TV.
function parkOffset(sheetHeight: number): number {
  return Math.max(0, sheetHeight - PEEK_HEIGHT);
}

// The list runs under the header rather than stopping at it, so it fades out as
// it goes: a hard cut reads as a row sliced in half.
const TOP_FADE = maskImage('linear-gradient(180deg, transparent 0, #000 40px)');

const SCRIM = 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55) 45%)';

const SHEET_FILL =
  'linear-gradient(180deg, transparent, rgba(10,10,12,0.55) 12%, rgba(10,10,12,0.97) 30%)';

const fillsDefinition = styles({
  scrimOn: { opacity: 1, pointerEvents: 'auto' },
  scrimOff: { opacity: 0, pointerEvents: 'none' },
});

interface Section {
  id: string;
  title: string;
  items: UpNextItem[];
  offset: number;
}

function buildSections(data: UpNextData, t: Translate): Section[] {
  const sections: Section[] = [];
  if (data.nextEpisodes.length) {
    sections.push({
      id: 'episodes',
      title: t('player.nextEpisodes'),
      items: data.nextEpisodes,
      offset: 0,
    });
  }
  if (data.recommendations.length) {
    sections.push({
      id: 'recommendations',
      title: t('player.recommendations'),
      items: data.recommendations,
      offset: data.nextEpisodes.length,
    });
  }
  return sections;
}

function peekSections(sections: Section[]): Section[] {
  const first = sections[0];
  if (!first) return [];
  return [{ ...first, items: first.items.slice(0, UP_NEXT_COLUMNS) }];
}

/** One sliding sheet with two positions: parked as a non-focusable peek, or
 * risen over a scrim into a scrollable grid the D-pad walks as one flat list. */
function UpNextSheetBase({
  data,
  open,
  revealed,
  onOpen,
  onClose,
  onPlay,
  ref,
}: Readonly<UpNextSheetProps>) {
  const playerStyleScoped = useStyles(playerStyle);

  const fills = useStyles(fillsDefinition);
  const s = useStyles(sDefinition);

  const t = useT();
  const items = useMemo(() => [...data.nextEpisodes, ...data.recommendations], [data]);
  const sections = useMemo(() => buildSections(data, t), [data, t]);

  // Seeded from the stage so the first frame is already parked: a height that
  // starts at 0 and corrects on layout flashes full-screen over the film.
  const { height: stageHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(() => Math.round(stageHeight * SHEET_FRACTION));

  const slide = useSheetSlide(open, parkOffset(sheetHeight));

  // An open sheet is an OVERLAY: it takes the remote from the screen behind it
  // (which is also what stops ▲ off the top row climbing out of the sheet), and
  // mounts a navigator of its own below - whose fresh entry scope is what lets
  // the first card's `autoFocus` claim the ring. Called from out here so it
  // locks the scope the sheet sits IN, not the one it opens (see <Dialog.Root>).
  useLockFocusBehind(open);

  // React Native has no calc(): the three-across width comes from the measured
  // row instead of calc((100% - 52px) / 3).
  const [rowWidth, setRowWidth] = useState(0);
  const card = rowWidth > 0 ? cellWidth(rowWidth, UP_NEXT_COLUMNS, UP_NEXT_GAP) : undefined;
  // What a focused card needs above it, measured rather than guessed: its ring
  // stands RING_ROOM off the still and the focus scale grows the still upwards
  // by half its extra height. Twice that is where a row parks: once for what
  // sticks out, once so it is visibly clear of the edge rather than flush
  // against it.
  const overhang = RING_ROOM + (((card ?? 0) * 9) / 16) * ((FOCUS_SCALE - 1) / 2);
  const headroom = overhang * 2;
  if (!open && (!revealed || items.length === 0)) return null;

  const grouped = sections.length > 1;
  const shown = open ? sections : peekSections(sections);

  return (
    <>
      <Pressable
        {...VIRTUAL_FOCUS}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('player.back')}
        style={[s.scrimBox, NO_OUTLINE, open ? fills.scrimOn : fills.scrimOff]}
      >
        <Veil ramp={SCRIM} />
      </Pressable>
      <Animated.View
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setSheetHeight((prev) => (prev === h ? prev : h));
        }}
        style={[s.sheetBox, slide]}
      >
        <Veil ramp={SHEET_FILL} />
        {/* One column, so ▲ off the top row reaches the header rather than
            leaving the sheet. `bridge={false}`: the screen's remote bridge is
            already listening, and a second would fire every press twice. */}
        <SheetScope open={open}>
          <SheetKeys handle={ref} open={open} onClose={onClose} />
          <SheetHeader
            open={open}
            title={t('player.upNextTitle')}
            onToggle={open ? onClose : onOpen}
          />
          <FocusScroll
            style={[s.list, TOP_FADE]}
            // Where a focused row parks: clear of the top edge, since a focused
            // card wears a ring and grows, and both live OUTSIDE its box.
            offsetFromStart={Math.ceil(headroom)}
            contentStyle={{
              paddingHorizontal: 56,
              paddingTop: Math.ceil(headroom),
              paddingBottom: 72,
            }}
          >
            <FocusColumn grid style={s.grid}>
              {shown.map((sec) => (
                <Box
                  key={sec.id}
                  gap={14}
                  onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
                >
                  {grouped ? <Text style={playerStyleScoped.eyebrow}>{sec.title}</Text> : null}
                  {rowsOf(sec.items).map((row, r) => (
                    <FocusRegion
                      // The line's position IS its identity: the items in it move
                      // as the data does, the line does not.
                      // oxlint-disable-next-line react/no-array-index-key -- see above
                      key={r}
                      style={s.row}
                    >
                      {row.map((it, c) => (
                        <UpNextCard
                          key={it.id}
                          item={it}
                          width={card}
                          interactive={open}
                          autoFocus={open && sec.offset === 0 && r === 0 && c === 0}
                          onActivate={onPlay}
                        />
                      ))}
                    </FocusRegion>
                  ))}
                </Box>
              ))}
            </FocusColumn>
          </FocusScroll>
        </SheetScope>
      </Animated.View>
    </>
  );
}

// Memoized so the parked sheet skips the chrome's ~4 Hz playback re-renders.
export const UpNextSheet = memo(UpNextSheetBase);

const sDefinition = styles({
  scrimBox: { fill: true, z: 43 },
  sheetBox: {
    absolute: true,
    left: 0,
    right: 0,
    bottom: 0,
    h: `${SHEET_FRACTION * 100}%`,
    z: 45,
    overflow: 'hidden',
  },
  fill: { flex: true, minH: 0 },
  list: { flex: true, minH: 0 },
  grid: { gap: 32 },
  row: { row: true, align: 'flex-start', gap: UP_NEXT_GAP },
});

/** The sheet's own navigator.
 *
 * Mounted whether the sheet is open or parked, and that is the point: swapping
 * it in on open would remount everything under it, and every card's artwork
 * would be thrown away and downloaded again. `entryKey` is what a scope that
 * OUTLIVES its arrivals uses instead - rising re-decides where focus opens, so
 * the first card still claims the ring. Parked, the cards render no control at
 * all (see <UpNextCard interactive>), so this navigator has nothing to focus and
 * the chrome keeps the remote. */
function SheetScope({ open, children }: Readonly<{ open: boolean; children: ReactNode }>) {
  const s = useStyles(sDefinition);

  return (
    <FocusScope bridge={false} active={open} entryKey={open ? 'open' : 'parked'}>
      {/* Fills the sheet, or the scroll view inside it takes the height of its
          CONTENT and there is nothing left to scroll - the rows below the fold
          simply never come. */}
      <FocusColumn style={s.fill}>{children}</FocusColumn>
    </FocusScope>
  );
}

/** The items, cut into the lines the eye sees - which is what the focus grid
 *  needs too: one <FocusRegion> per line, so ▲▼ keep their column. */
function rowsOf(items: readonly UpNextItem[]): UpNextItem[][] {
  const out: UpNextItem[][] = [];
  for (let at = 0; at < items.length; at += UP_NEXT_COLUMNS) {
    out.push(items.slice(at, at + UP_NEXT_COLUMNS));
  }
  return out;
}
