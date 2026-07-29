import type { RemoteKey, Translate } from '@kroma/core';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { cellWidth } from '#ui/components/atoms/grid';
import { Txt } from '#ui/components/atoms/text';
import { gradient } from '#ui/lib/css';
import { ease } from '#ui/lib/ease';
import { fonts } from '#ui/lib/tokens';
import { useT } from '#ui/services/i18n';
import { useGridFocus } from '../hooks/useGridFocus';
import type { PanelHandle } from '../lib/nav';
import { EYEBROW } from '../lib/style';
import { VIRTUAL_FOCUS } from '../lib/virtual-focus';
import { IconCollapse } from './icons';
import { UP_NEXT_COLUMNS, UP_NEXT_GAP, UpNextCard, type UpNextItem } from './UpNextCard';

export type { UpNextItem };

/** The two contextual buckets feeding the sheet (§10). For a film,
 * `nextEpisodes` is empty so only recommendations show. */
export interface UpNextData {
  nextEpisodes: UpNextItem[];
  recommendations: UpNextItem[];
}

export interface UpNextSheetProps {
  data: UpNextData;
  /** overlay === 'sheet': the sheet rises and captures the D-pad. */
  open: boolean;
  /** Chrome visible; the peek shows ONLY when revealed AND there is data. */
  revealed: boolean;
  /** Header press / ▼ from the controls: the shell opens the sheet. */
  onOpen: () => void;
  onClose: () => void;
  onPlay: (item: UpNextItem) => void;
}

/** Pixels of the sheet that peek above the bottom edge while parked (§10).
 * Exported because the bottom chrome has to clear exactly this much - see
 * Player.tsx, which used to carry its own nearly-equal copy of the number. */
export const PEEK_HEIGHT = 150;
/** Sheet height as a fraction of the player surface. */
const SHEET_FRACTION = 0.82;

/** How far down the sheet sits when parked: everything but the peek.
 *
 * In PIXELS, measured. It used to be a percentage string, which react-native-web
 * hands to CSS (where a percentage transform resolves against the element's own
 * box) but which native React Native cannot interpret at all - so on Apple TV the
 * sheet never parked and the "À suivre" grid covered the film the instant
 * playback started, transport controls and all. */
function parkOffset(sheetHeight: number): number {
  return Math.max(0, sheetHeight - PEEK_HEIGHT);
}

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

/** Split the data into "Épisodes suivants" then "Recommandations", tracking the
 * flat offset each section starts at so one focus index spans every card. */
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

/** While parked only the peek's first row is visible, so only it mounts (and
 * only its art is fetched); the rest of the grid mounts when the sheet opens. */
function peekSections(sections: Section[]): Section[] {
  const first = sections[0];
  if (!first) return [];
  return [{ ...first, items: first.items.slice(0, UP_NEXT_COLUMNS) }];
}

/**
 * The YouTube-TV-style "À suivre" surface (§10): ONE sliding sheet with two
 * positions. Parked (peek) it sits low so only the header + a clipped card row
 * show, and the cards are not focusable (the shell owns ▼). Open, it rises over
 * a scrim into a scrollable grid grouped into "Épisodes suivants" then
 * "Recommandations". D-pad focus runs across the FLAT list of every card via
 * `useGridFocus` (cols=3); ▲ off the top (or Back) closes, Enter plays.
 */
const UpNextSheetBase = forwardRef<PanelHandle, UpNextSheetProps>(function UpNextSheet(
  { data, open, revealed, onOpen, onClose, onPlay },
  ref,
) {
  const t = useT();
  const items = useMemo(() => [...data.nextEpisodes, ...data.recommendations], [data]);
  const sections = useMemo(() => buildSections(data, t), [data, t]);

  const grid = useGridFocus({
    count: items.length,
    cols: UP_NEXT_COLUMNS,
    onActivate: (i) => {
      const it = items[i];
      if (it) onPlay(it);
    },
    onExit: (edge) => {
      if (edge === 'top') onClose();
    },
    onBack: onClose,
  });

  // The sheet only owns the D-pad while open; otherwise the shell handles ▼.
  useImperativeHandle(
    ref,
    () => ({ onKey: (key: RemoteKey) => (open ? grid.onKey(key) : false) }),
    [open, grid.onKey],
  );

  // The sheet's own height, which is what "parked" is measured against. Seeded
  // from the stage so the very first frame is already parked (a sheet that starts
  // at 0 and corrects on layout is a full-screen flash over the film), then kept
  // honest by onLayout.
  const { height: stageHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(() => Math.round(stageHeight * SHEET_FRACTION));

  // Rise / park. Animated rather than a CSS transition so the one sheet slides
  // the same way on every target.
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

  // Scroll the focused card into view on D-pad nav ONLY (keyNonce bumps on arrow
  // keys, not on hover), so the ring never leaves the viewport on a TV while a
  // pointer hover leaves the scroll position, and the layout under it, untouched.
  // Row offsets come from onLayout rather than from the DOM, so this works on a
  // TV where there is no scrollIntoView.
  const scroller = useRef<ScrollView>(null);
  const rowTop = useRef(new Map<number, number>());
  // React Native has no calc(), so the three-across card width is computed from
  // the measured row width instead of expressed as calc((100% - 52px) / 3).
  const [rowWidth, setRowWidth] = useState(0);
  const card = rowWidth > 0 ? cellWidth(rowWidth, UP_NEXT_COLUMNS, UP_NEXT_GAP) : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: grid.keyNonce is a change-trigger (re-run on D-pad moves only), intentionally not read in the body.
  useEffect(() => {
    if (!open) return;
    const y = rowTop.current.get(Math.floor(grid.index / UP_NEXT_COLUMNS));
    if (y != null) scroller.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, [grid.keyNonce, open]);

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
        pointerEvents={open ? 'auto' : 'none'}
        style={[SCRIM_BOX, SCRIM, { opacity: open ? 1 : 0 }]}
      />
      <Animated.View
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setSheetHeight((prev) => (prev === h ? prev : h));
        }}
        style={[
          SHEET_BOX,
          SHEET_FILL,
          {
            transform: [
              {
                translateY: slide.interpolate({
                  inputRange: [0, 1],
                  // Parked, all but PEEK_HEIGHT of the sheet sits below the edge.
                  outputRange: [0, parkOffset(sheetHeight)],
                }),
              },
            ],
          },
        ]}
      >
        <SheetHeader
          open={open}
          title={t('player.upNextTitle')}
          onToggle={open ? onClose : onOpen}
        />
        <ScrollView
          ref={scroller}
          scrollEnabled={open}
          showsVerticalScrollIndicator={false}
          // Top padding is the focused still's headroom: at 4px the first row's
          // ring was shaved off by the sheet's own overflow clip. The bottom
          // matches, so the last row clears the screen edge instead of dying
          // against it.
          contentContainerStyle={{ paddingHorizontal: 56, paddingTop: 16, paddingBottom: 72 }}
        >
          {shown.map((sec) => (
            <Box key={sec.id} mb={32}>
              {grouped ? <Txt style={[EYEBROW, { marginBottom: 14 }]}>{sec.title}</Txt> : null}
              <Box
                row
                wrap
                align="flex-start"
                gap={UP_NEXT_GAP}
                onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
              >
                {sec.items.map((it, li) => {
                  const flat = sec.offset + li;
                  return (
                    <CardCell
                      key={it.id}
                      row={Math.floor(flat / UP_NEXT_COLUMNS)}
                      width={card}
                      onRowTop={(row, y) => rowTop.current.set(row, y)}
                    >
                      <UpNextCard
                        item={it}
                        focused={open && grid.index === flat}
                        onActivate={() => onPlay(it)}
                        onFocus={open ? grid.hover(flat) : undefined}
                      />
                    </CardCell>
                  );
                })}
              </Box>
            </Box>
          ))}
        </ScrollView>
      </Animated.View>
    </>
  );
});

/** Memoized: between playback ticks every prop is stable (the shell hoists its
 * handlers), so the parked sheet skips the chrome's ~4 Hz re-renders. */
export const UpNextSheet = memo(UpNextSheetBase);

/** Reports where its row starts, so the sheet can scroll a D-pad move into view
 * without reaching for the DOM. */
function CardCell({
  row,
  width,
  onRowTop,
  children,
}: Readonly<{
  row: number;
  width?: number;
  onRowTop: (row: number, y: number) => void;
  children: React.ReactNode;
}>) {
  const onLayout = (e: LayoutChangeEvent) => onRowTop(row, e.nativeEvent.layout.y);
  return (
    <Box onLayout={onLayout} w={width}>
      {children}
    </Box>
  );
}

const SCRIM_BOX = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 43,
};

const SHEET_BOX = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  bottom: 0,
  height: `${SHEET_FRACTION * 100}%` as const,
  zIndex: 45,
  overflow: 'hidden' as const,
};

/** The pressable header: title + a chevron that flips between the two states. */
function SheetHeader({
  open,
  title,
  onToggle,
}: Readonly<{ open: boolean; title: string; onToggle: () => void }>) {
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Box row align="center" gap={14} px={56} pt={28} pb={18}>
        <Txt style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: '700' }}>{title}</Txt>
        <Box style={{ transform: [{ rotate: open ? '0deg' : '180deg' }] }}>
          <Chevron />
        </Box>
      </Box>
    </Pressable>
  );
}

function Chevron() {
  return <IconCollapse size={20} stroke={2.2} color="accent" />;
}
