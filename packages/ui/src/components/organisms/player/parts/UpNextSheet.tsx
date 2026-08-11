import type { RemoteKey, Translate } from '@kroma/core';
import {
  forwardRef,
  memo,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, useWindowDimensions } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { cellWidth } from '#ui/components/atoms/grid';
import { Text } from '#ui/components/atoms/text';
import { RING_ROOM, styles } from '#ui/core';
import { gradient, maskImage } from '#ui/lib/css';
import { ease } from '#ui/lib/ease';
import { FocusColumn, FocusRegion, FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';
import { FocusScroll } from '#ui/lib/focus-scroll';
import { pointerDriving } from '#ui/lib/input-source';
import { useT } from '#ui/services/i18n';
import type { PanelHandle } from '../lib/nav';
import { FOCUS_SCALE, playerStyle } from '../lib/style';
import { VIRTUAL_FOCUS } from '../lib/virtual-focus';
import { IconCollapse } from './icons';
import { UP_NEXT_COLUMNS, UP_NEXT_GAP, UpNextCard, type UpNextItem } from './UpNextCard';

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

const SCRIM = gradient('linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55) 45%)');
const SHEET_FILL = gradient(
  'linear-gradient(180deg, transparent, rgba(10,10,12,0.55) 12%, rgba(10,10,12,0.97) 30%)',
);

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
const UpNextSheetBase = forwardRef<PanelHandle, UpNextSheetProps>(function UpNextSheet(
  { data, open, revealed, onOpen, onClose, onPlay },
  ref,
) {
  const t = useT();
  const items = useMemo(() => [...data.nextEpisodes, ...data.recommendations], [data]);
  const sections = useMemo(() => buildSections(data, t), [data, t]);

  // The open sheet is the navigator's: its cards are <Focusable>s in a focus
  // grid, so ◀▶▲▼ and OK have already been answered by the time this runs. Back
  // is the one key the navigator does not own; ▲ off the top row reaches the
  // header, and reaching the header IS leaving (see <SheetHeader>).
  useImperativeHandle(
    ref,
    () => ({
      onKey: (key: RemoteKey) => {
        if (!open) return false;
        if (key === 'Back') onClose();
        return true;
      },
    }),
    [open, onClose],
  );

  // Seeded from the stage so the first frame is already parked: a height that
  // starts at 0 and corrects on layout flashes full-screen over the film.
  const { height: stageHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(() => Math.round(stageHeight * SHEET_FRACTION));

  const slide = useRef(new Animated.Value(open ? 0 : 1)).current;
  useEffect(() => {
    const anim = Animated.timing(slide, {
      toValue: open ? 0 : 1,
      duration: 340,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [open, slide]);

  // An open sheet is an OVERLAY: it takes the remote from the screen behind it
  // (which is also what stops ▲ off the top row climbing out of the sheet), and
  // mounts a navigator of its own below - whose fresh entry scope is what lets
  // the first card's `autoFocus` claim the ring. Called from out here so it
  // locks the scope the sheet sits IN, not the one it opens (see <Dialog>).
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
        style={[
          s.scrimBox,
          SCRIM,
          { opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' },
        ]}
      />
      <Animated.View
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setSheetHeight((prev) => (prev === h ? prev : h));
        }}
        style={[
          s.sheetBox,
          SHEET_FILL,
          {
            transform: [
              {
                translateY: slide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, parkOffset(sheetHeight)],
                }),
              },
            ],
          },
        ]}
      >
        {/* One column, so ▲ off the top row reaches the header rather than
            leaving the sheet. `bridge={false}`: the screen's remote bridge is
            already listening, and a second would fire every press twice. */}
        <SheetScope open={open}>
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
                  {grouped ? <Text style={playerStyle.eyebrow}>{sec.title}</Text> : null}
                  {rowsOf(sec.items).map((row, r) => (
                    <FocusRegion
                      // The line's position IS its identity: the items in it move
                      // as the data does, the line does not.
                      // biome-ignore lint/suspicious/noArrayIndexKey: see above
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
                          onActivate={() => onPlay(it)}
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
});

// Memoized so the parked sheet skips the chrome's ~4 Hz playback re-renders.
export const UpNextSheet = memo(UpNextSheetBase);

const s = styles({
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
  sheetTitle: { font: 'display', fontSize: 22, fontWeight: '700' },
  headerRow: { row: true, align: 'flex-start' },
  headerBox: { px: 56, pt: 28, pb: 18, radius: 'lg' },
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

function SheetHeader({
  open,
  title,
  onToggle,
}: Readonly<{ open: boolean; title: string; onToggle: () => void }>) {
  // Arriving here on the remote closes the sheet, so ▲ off the top row is one
  // press and not two - the header is the way out, not a stop on the way. Only
  // on the remote: a cursor sweeping over it must not close anything, and the
  // navigator focuses on mouse-enter (see lib/input-source).
  const leave = () => {
    if (!pointerDriving()) onToggle();
  };
  const inside = (
    <Box row align="center" gap={14}>
      <Text style={s.sheetTitle}>{title}</Text>
      <Box style={{ transform: [{ rotate: open ? '0deg' : '180deg' }] }}>
        <Chevron />
      </Box>
    </Box>
  );
  // Parked, the sheet is a picture and the chrome owns the remote, so the header
  // is pointer-only. Open, it is where ▲ off the top row goes and how a remote
  // closes the sheet without Back.
  return (
    <FocusRegion style={s.headerRow}>
      <Focusable
        label={title}
        onPress={onToggle}
        onFocus={open ? leave : undefined}
        // Registered while parked so it keeps its place ABOVE the grid (the
        // navigator fixes a node's order when it mounts), but it wears nothing:
        // a ring on a parked sheet marks a focus the remote is not on.
        ring={open}
        focusScale={1}
        style={s.headerBox}
      >
        {inside}
      </Focusable>
    </FocusRegion>
  );
}

function Chevron() {
  return <IconCollapse size={20} stroke={2.2} color="accentText" />;
}
