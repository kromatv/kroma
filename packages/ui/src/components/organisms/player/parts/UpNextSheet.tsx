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

  useImperativeHandle(
    ref,
    () => ({ onKey: (key: RemoteKey) => (open ? grid.onKey(key) : false) }),
    [open, grid.onKey],
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

  // Scroll on D-pad nav only, and from onLayout offsets rather than the DOM:
  // a TV has no scrollIntoView, and a pointer hover must not move the scroll.
  const scroller = useRef<ScrollView>(null);
  const rowTop = useRef(new Map<number, number>());
  // React Native has no calc(): the three-across width comes from the measured
  // row instead of calc((100% - 52px) / 3).
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
          // Headroom for the focused still's ring, which the sheet's own
          // overflow clip would otherwise shave off the first row.
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

// Memoized so the parked sheet skips the chrome's ~4 Hz playback re-renders.
export const UpNextSheet = memo(UpNextSheetBase);

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
