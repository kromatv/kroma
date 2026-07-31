// The command palette: ⌘K, and the workbench's one search. Driven by a keyboard
// cursor on the web and by the spatial navigator on a television.

import {
  Box,
  Field,
  Focusable,
  Icon,
  type IconName,
  styles,
  sv,
  Txt,
  webDocument,
  webWindow,
} from '@kroma/ui/kit';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView } from 'react-native';
import { RULE, RULE_TOP } from './chrome';
import { MONO } from './code';
import { groupBy, matches, type Story } from './story';

const WEB = Platform.OS === 'web';

// Every row and heading is pinned to these heights: the scroll-to-cursor is
// arithmetic rather than a measurement pass.
const ROW = 36;
const HEADING = 26;
const LIST_PAD = 6;
const LIST_MAX = 320;
const SEPARATOR = 1;

interface CommandGroup {
  title: string;
  items: readonly Story[];
}

function commandGroups(stories: readonly Story[], query: string): CommandGroup[] {
  const hits = stories.filter((story) => matches(story, query));
  return groupBy(hits, (story) => story.tier).map(({ key, items }) => ({ title: key, items }));
}

function flatten(groups: readonly CommandGroup[]): Story[] {
  return groups.flatMap((group) => [...group.items]);
}

/** Pixel offset of the nth result inside the scroller. */
function offsetOf(groups: readonly CommandGroup[], index: number): number {
  let y = LIST_PAD;
  let seen = 0;
  for (const group of groups) {
    y += HEADING;
    if (index < seen + group.items.length) return y + (index - seen) * ROW;
    y += group.items.length * ROW;
    seen += group.items.length;
    // The hairline drawn between groups: unaccounted, it accumulates and the
    // in-view test goes wrong at the last group's boundary.
    y += SEPARATOR;
  }
  return y;
}

const TIER_GLYPH: Record<string, IconName> = {
  Foundations: 'palette',
  Atoms: 'circle-square',
  Molecules: 'components',
  Organisms: 'layout-board',
  Templates: 'layout',
};

function glyphFor(tier: string): IconName {
  return TIER_GLYPH[tier] ?? 'square';
}

function isMac(): boolean {
  const agent = webWindow()?.navigator?.userAgent ?? '';
  return /Mac|iPhone|iPad|iPod/.test(agent);
}

/** `⌘ K` on a Mac, `Ctrl K` everywhere else. */
function commandHint(): string {
  return isMac() ? '⌘ K' : 'Ctrl K';
}

function Kbd({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box px={6} py={2} radius={6} bg="surface3" style={s.cap}>
      <Txt variant="meta" color="textMuted" style={s.capInk}>
        {children}
      </Txt>
    </Box>
  );
}

// Capture phase: react-native-web's TextInput stops propagation on keydown, so a
// bubbling listener is deaf while a field is focused. The event is swallowed too,
// to beat the browser's own ⌘K.
function useCaptureKey(match: (event: KeyboardEvent) => boolean, onKey: () => void): void {
  useEffect(() => {
    const document = webDocument();
    if (!document) return;
    const listener = (event: KeyboardEvent) => {
      if (!match(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onKey();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [match, onKey]);
}

const isCommandK = (event: KeyboardEvent): boolean =>
  (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey);

const isEscape = (event: KeyboardEvent): boolean => event.key === 'Escape';

function useCommandKey(onOpen: () => void): void {
  useCaptureKey(isCommandK, onOpen);
}

function useEscapeKey(onClose: () => void): void {
  useCaptureKey(isEscape, onClose);
}

const PAGE = 8;

// Both spellings of the directions: a television names them without the `Arrow`
// prefix (see lib/focus-remote.web.ts). Enter and Escape sit here with a zero
// step so one lookup answers which keys the palette swallows.
const STEP: Record<string, number> = {
  ArrowUp: -1,
  ArrowDown: 1,
  Up: -1,
  Down: 1,
  PageUp: -PAGE,
  PageDown: PAGE,
  Enter: 0,
  Escape: 0,
};

interface CommandPaletteProps {
  stories: readonly Story[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  width: number;
}

function CommandPalette({
  stories,
  selected,
  onSelect,
  onClose,
  width,
}: Readonly<CommandPaletteProps>) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const groups = useMemo(() => commandGroups(stories, query), [stories, query]);
  const flat = useMemo(() => flatten(groups), [groups]);
  const at = Math.min(cursor, Math.max(0, flat.length - 1));

  const list = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewport = useRef(LIST_MAX);

  const choose = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      onSelect(id);
      onClose();
    },
    [onSelect, onClose],
  );

  // Keep the cursor on screen, moving the list as little as possible: recentring
  // on every arrow press flickers the whole list past the row being read.
  useEffect(() => {
    const y = offsetOf(groups, at);
    const top = offset.current;
    const bottom = top + viewport.current;
    if (y >= top && y + ROW <= bottom) return;
    const next = y < top ? y - LIST_PAD : y + ROW - viewport.current + LIST_PAD;
    list.current?.scrollTo({ y: Math.max(0, next), animated: false });
  }, [groups, at]);

  useEffect(() => {
    const document = webDocument();
    if (!document) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.key in STEP)) return;
      // stopPropagation keeps the press from also reaching the spatial
      // navigator's listener, which would move focus behind the palette.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') return onClose();
      if (event.key === 'Enter') return choose(flat[at]?.id);
      const delta = STEP[event.key] ?? 1;
      // Wraps. The `+ length * PAGE` keeps a backwards step non-negative before
      // the modulo, with headroom for PageUp's eight.
      setCursor((prev) => {
        if (flat.length === 0) return 0;
        const from = Math.min(prev, flat.length - 1);
        return (from + delta + flat.length * PAGE) % flat.length;
      });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [flat, at, choose, onClose]);

  const sheet = Math.min(640, width - 32);

  return (
    <Box absolute top={0} right={0} bottom={0} left={0} z={40} align="center" style={s.scrim}>
      <Focusable label="Close search" ring={false} onPress={onClose} style={s.scrimTap} />
      <Box
        w={sheet}
        mt={96}
        bg="surface2"
        radius="lg"
        border="borderStrong"
        borderWidth={1}
        shadow="pop"
        overflow="hidden"
      >
        <Box row align="center" px={14} style={RULE}>
          <Box flex>
            <Field
              value={query}
              onChange={(next) => {
                setQuery(next);
                setCursor(0);
              }}
              onSubmit={() => choose(flat[at]?.id)}
              placeholder="Search components…"
              // Not "Search components": that is the sidebar button's accessible
              // name, and two controls sharing one is ambiguous to assistive tech.
              label="Search the component list"
              hideLabel
              physicalKeyboard
              autoFocus
              icon="search"
              entry={{
                px: 0,
                py: 14,
                radius: 0,
                bg: 'transparent',
                borderWidth: 0,
                // The sheet is the focus surface: the palette opens focused, and
                // a field ring here outlines a row the dialog's corners clip.
                ring: false,
                gap: 10,
                textStyle: s.input,
              }}
            />
          </Box>
          <Kbd>esc</Kbd>
        </Box>

        {flat.length === 0 ? (
          <Box py={34} center>
            <Txt variant="meta" color="textDim">
              No components found.
            </Txt>
          </Box>
        ) : (
          <ScrollView
            ref={list}
            style={{ maxHeight: LIST_MAX }}
            contentContainerStyle={s.list}
            onScroll={(event) => {
              offset.current = event.nativeEvent.contentOffset.y;
            }}
            onLayout={(event) => {
              viewport.current = event.nativeEvent.layout.height;
            }}
            scrollEventThrottle={16}
          >
            {groups.map((group, groupAt) => (
              <Box key={group.title}>
                <Box h={HEADING} justify="center" px={8}>
                  <Txt variant="overline" color="textDim">
                    {group.title}
                  </Txt>
                </Box>
                {group.items.map((story) => {
                  const index = flat.indexOf(story);
                  return (
                    <Row
                      key={story.id}
                      story={story}
                      open={story.id === selected}
                      cursor={WEB && index === at}
                      onPress={() => choose(story.id)}
                    />
                  );
                })}
                {groupAt < groups.length - 1 ? <Box h={SEPARATOR} mx={-6} bg="border" /> : null}
              </Box>
            ))}
          </ScrollView>
        )}

        <Box row align="center" gap={14} px={14} py={9} style={RULE_TOP}>
          <Hint keys={['↑', '↓']} label="navigate" />
          <Hint keys={['↵']} label="select" />
          <Box flex />
          <Txt variant="meta" color="textDim" style={s.tally}>
            {`${flat.length} of ${stories.length}`}
          </Txt>
        </Box>
      </Box>
    </Box>
  );
}

function Row({
  story,
  open,
  cursor,
  onPress,
}: Readonly<{ story: Story; open: boolean; cursor: boolean; onPress: () => void }>) {
  return (
    <Focusable
      label={story.name}
      ring={false}
      onPress={onPress}
      sv={paletteRow}
      vars={{ cursor, open }}
    >
      {({ slots }) => (
        <>
          <Icon name={glyphFor(story.tier)} size={15} color={open ? 'accent' : 'textDim'} />
          <Txt variant="meta" style={slots.name} lines={1}>
            {story.name}
          </Txt>
          <Box flex />
          <Txt variant="meta" color="textDim" style={s.group} lines={1}>
            {story.group}
          </Txt>
          {open ? <Box w={5} h={5} radius="pill" bg="accent" /> : null}
        </>
      )}
    </Focusable>
  );
}

function Hint({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <Box row align="center" gap={5}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <Txt variant="meta" color="textDim" style={s.hint}>
        {label}
      </Txt>
    </Box>
  );
}

const s = styles({
  scrim: { bg: 'bg/72' },
  scrimTap: { fill: true },
  list: { p: LIST_PAD },
  input: { fontSize: 15, fontWeight: '500' },
  group: { fontSize: 11.5 },
  hint: { fontSize: 11.5 },
  tally: { fontSize: 11.5, fontFamily: MONO },
  cap: { border: 'border', shadow: 'card' },
  capInk: { fontSize: 10.5, fontFamily: MONO, lineHeight: 14 },
});
// The sheet is a lifted surface, where the chrome's plain focus wash reads as
// nothing; the keyboard cursor wears the same coat as focus, since only one of
// the two drives at a time.
const paletteRow = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 10,
      h: ROW,
      px: 8,
      radius: 'sm',
      _focus: { bg: 'white/7' },
    },
    name: { fontSize: 13.5, fontWeight: '600', color: 'textMuted' },
  },
  variants: {
    cursor: { true: { root: { bg: 'white/7' }, name: { color: 'text' } } },
    open: { true: { name: { color: 'text' } } },
  },
  defaults: { cursor: false, open: false },
});

export type { CommandGroup, CommandPaletteProps };
export {
  CommandPalette,
  commandGroups,
  commandHint,
  flatten,
  Kbd,
  offsetOf,
  useCommandKey,
  useEscapeKey,
};
