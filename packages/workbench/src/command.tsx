// The command palette: ⌘K, and the workbench's one search.
//
// The sidebar used to carry a filter field, which meant the only way to reach a
// component was to first find its section in the tree. A palette inverts that:
// type three letters from anywhere and the thing you want is one Enter away,
// which is how everyone already navigates their editor. So the tree went back to
// being navigation and this became the search.
//
// The design is cmdk's - shadcn's command dialog - because that is the shape this
// interaction has settled on everywhere it appears: an input with a hairline
// under it, results grouped under quiet headings, a cursor that is a fill rather
// than a ring, and a footer that says which keys do what. It is rebuilt out of
// <Box> and <Txt> rather than imported, for the reason nothing here is imported:
// cmdk is a DOM library, and this palette has to open on an Apple TV too.
//
// The two platforms drive it differently, and neither is emulated:
//
//   web    - one capture-phase listener on the document owns Up, Down, Enter and
//            Escape, and the cursor it moves is state in here. Capture, not
//            bubble, because react-native-web's TextInput calls stopPropagation
//            on every keydown (its issue #612): a bubble listener goes deaf the
//            moment the caret lands in the search field, which is always.
//   native - no document, so no listener. Every result is a <Focusable>, and the
//            spatial navigator moves between them exactly as it does in the tree.
//
// Which is why the cursor fill is web-only: on a television the navigator's own
// focus wash is already saying the same thing, and two highlights on one row read
// as a bug.

import {
  Box,
  Field,
  Focusable,
  Icon,
  type IconName,
  Txt,
  webDocument,
  webWindow,
} from '@kroma/ui/kit';
import { colors, radius, shadow } from '@kroma/ui/tokens';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView } from 'react-native';
import { FOCUS_WASH_STRONG, RULE, RULE_TOP } from './chrome';
import { MONO } from './code';
import { groupBy, matches, type Story } from './story';

/** The palette drives itself from a keyboard cursor on the web and from the
 * spatial navigator everywhere else. See the header. */
const WEB = Platform.OS === 'web';

/** Exact row metrics, because the scroll-to-cursor is ARITHMETIC rather than a
 * measurement pass: every row and every heading is pinned to these heights, so
 * the offset of the nth result is a sum instead of a layout race. */
const ROW = 36;
const HEADING = 26;
const LIST_PAD = 6;
const LIST_MAX = 320;
/** The hairline between two groups. Rendered by the list, so `offsetOf` counts it. */
const SEPARATOR = 1;

/** One heading and the results under it. */
interface CommandGroup {
  /** The atomic level: Foundations, Atoms, Molecules... */
  title: string;
  items: readonly Story[];
}

/** The stories a query leaves, grouped by atomic level - through the same
 * `groupBy` the sidebar's tree uses, so the two can never disagree about where a
 * component lives. */
function commandGroups(stories: readonly Story[], query: string): CommandGroup[] {
  const hits = stories.filter((story) => matches(story, query));
  return groupBy(hits, (story) => story.tier).map(({ key, items }) => ({ title: key, items }));
}

/** The results as one list, which is what the cursor indexes into. Groups are
 * only how they are DRAWN. */
function flatten(groups: readonly CommandGroup[]): Story[] {
  return groups.flatMap((group) => [...group.items]);
}

/**
 * Where the nth result sits inside the scroller.
 *
 * Pure, and tested, because it is the difference between a palette you can hold
 * Down on and one whose cursor walks off the bottom edge.
 */
function offsetOf(groups: readonly CommandGroup[], index: number): number {
  let y = LIST_PAD;
  let seen = 0;
  for (const group of groups) {
    y += HEADING;
    if (index < seen + group.items.length) return y + (index - seen) * ROW;
    y += group.items.length * ROW;
    seen += group.items.length;
    // The hairline drawn BETWEEN groups (see the list below). It is only one
    // pixel, but this offset is arithmetic rather than a measurement, so an
    // unaccounted one accumulates: with the kit's five levels a cursor in the
    // last group is computed 4px above where it sits, which is enough to make
    // the in-view test wrong at the boundary and jump the scroller.
    y += SEPARATOR;
  }
  return y;
}

/** The glyph a level gets in the results, so a row is identifiable before its
 * name is read. Foundations are the tokens, an atom is one part, a molecule is a
 * few clipped together, an organism is a region, a template is a whole page. */
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

/** `⌘` on a Mac, `Ctrl` everywhere else. Read from the browser rather than from
 * the build, because the same bundle is opened on both. */
function isMac(): boolean {
  const agent = webWindow()?.navigator?.userAgent ?? '';
  return /Mac|iPhone|iPad|iPod/.test(agent);
}

/** The palette's own accelerator, spelled for the machine reading it. */
function commandHint(): string {
  return isMac() ? '⌘ K' : 'Ctrl K';
}

/**
 * A keycap. Small, monospaced, and raised off the surface it sits on, which is
 * the one visual convention for "press this" that needs no label.
 */
function Kbd({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box px={6} py={2} radius={6} bg="surface3" style={CAP}>
      <Txt variant="meta" color="textMuted" style={CAP_INK}>
        {children}
      </Txt>
    </Box>
  );
}

/**
 * A page-wide accelerator, taken over from whatever has the caret.
 *
 * CAPTURE phase, and that is the whole reason this exists once rather than at
 * each call site: react-native-web's TextInput stops propagation on keydown, so
 * a bubbling listener is deaf for exactly as long as a field is focused - which
 * for a palette's own shortcut is most of the time. This file is where the
 * workbench keeps its one piece of knowledge about that.
 *
 * The event is swallowed as well as handled: a dev tool that asks for ⌘K has to
 * mean it, and Chrome's search-the-address-bar is the competing claim.
 */
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

/** ⌘K / Ctrl-K, from anywhere on the page. */
function useCommandKey(onOpen: () => void): void {
  useCaptureKey(isCommandK, onOpen);
}

/** Escape, for the transient chrome that is not the palette: the toolbar's menus. */
function useEscapeKey(onClose: () => void): void {
  useCaptureKey(isEscape, onClose);
}

/** How many results PageUp / PageDown cover. Eight, which is roughly the
 * scroller's own height, so a page really is a page. */
const PAGE = 8;

/**
 * How far each key moves the cursor, which is also the set of keys the palette
 * takes over while it is open.
 *
 * Both spellings of the directions: a television names them without the `Arrow`
 * prefix (see lib/focus-remote.web.ts), and the workbench opens on one.
 * `Enter` and `Escape` are in the table with a step of zero so that ONE lookup
 * answers "is this mine?" for every key, rather than a set and a switch that can
 * disagree about which keys the palette swallows.
 */
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
  /** Marked in the results, so the palette says where you already are. */
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** The window, for the sheet's own width. The palette is not laid out by the
   *  workbench's three-region layout - it floats over all of it. */
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
  // A narrowed query can leave the cursor past the end of the list, and a cursor
  // pointing at nothing is what makes Enter do nothing at all.
  const at = Math.min(cursor, Math.max(0, flat.length - 1));

  const list = useRef<ScrollView>(null);
  // Neither of these is state: the scroller's offset changes on every frame of a
  // fling, and re-rendering the palette for it would be absurd.
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

  // Keep the cursor on screen, and move the list AS LITTLE AS POSSIBLE: a palette
  // that recentres on every arrow press makes the whole list flicker past while
  // you are trying to read one row of it.
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
      // Both, and in capture: `preventDefault` stops the page scrolling and the
      // caret walking, `stopPropagation` keeps the same press from ALSO reaching
      // the spatial navigator's document listener, which would move focus in the
      // page behind the palette.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') return onClose();
      if (event.key === 'Enter') return choose(flat[at]?.id);
      const delta = STEP[event.key] ?? 1;
      // Wraps, because a list you cannot walk off the end of is one fewer thing
      // to think about than a list that stops. The `+ length` before the modulo
      // is what keeps a backwards step off the end negative-free, and PageUp's
      // eight of them need eight lengths of headroom.
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
    // The scrim is the dismiss target, as it is for the nav drawer, and a
    // <Focusable> so a remote can reach it too. `justify="flex-start"` with a
    // top inset rather than dead-centre: a palette that grows and shrinks with
    // its result count should grow DOWNWARDS from a fixed line, not drift up and
    // down the window as you type.
    <Box absolute top={0} right={0} bottom={0} left={0} z={40} align="center" style={SCRIM}>
      <Focusable label="Close search" ring={false} onPress={onClose} style={SCRIM_TAP} />
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
                // A new query is a new list, and the cursor belongs on its first
                // result - not wherever it happened to sit in the old one.
                setCursor(0);
              }}
              onSubmit={() => choose(flat[at]?.id)}
              placeholder="Search components…"
              // Not "Search components", which is the SIDEBAR button's name: two
              // controls sharing an accessible name is one an assistive
              // technology cannot tell you which of them you are in.
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
                gap: 10,
                textStyle: INPUT,
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
            contentContainerStyle={LIST}
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
          <Txt variant="meta" color="textDim" style={TALLY}>
            {`${flat.length} of ${stories.length}`}
          </Txt>
        </Box>
      </Box>
    </Box>
  );
}

/** One result. The name leads, the sub-section trails it dimmed, and the story
 * currently open in the canvas carries an amber dot: the palette should be able
 * to answer "where am I" as well as "where do I want to be". */
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
      style={[ITEM, cursor && FOCUS_WASH_STRONG]}
      focusedStyle={FOCUS_WASH_STRONG}
    >
      <Icon name={glyphFor(story.tier)} size={15} color={open ? 'accent' : 'textDim'} />
      <Txt variant="meta" color={cursor || open ? 'text' : 'textMuted'} style={NAME} lines={1}>
        {story.name}
      </Txt>
      <Box flex />
      <Txt variant="meta" color="textDim" style={GROUP} lines={1}>
        {story.group}
      </Txt>
      {open ? <Box w={5} h={5} radius="pill" bg="accent" /> : null}
    </Focusable>
  );
}

/** A key or two, then what they do. */
function Hint({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <Box row align="center" gap={5}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <Txt variant="meta" color="textDim" style={HINT}>
        {label}
      </Txt>
    </Box>
  );
}

const SCRIM = { backgroundColor: 'rgba(10, 10, 12, 0.72)' } as const;
const SCRIM_TAP = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
const LIST = { padding: LIST_PAD } as const;
const INPUT = { fontSize: 15, fontWeight: '500' as const };
const ITEM = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  height: ROW,
  paddingHorizontal: 8,
  borderRadius: radius.sm,
} as const;
const NAME = { fontSize: 13.5, fontWeight: '600' } as const;
const GROUP = { fontSize: 11.5 } as const;
const HINT = { fontSize: 11.5 } as const;
const TALLY = { fontSize: 11.5, fontFamily: MONO } as const;
const CAP = {
  borderWidth: 1,
  borderColor: colors.border,
  boxShadow: shadow.card,
} as const;
const CAP_INK = { fontSize: 10.5, fontFamily: MONO, lineHeight: 14 } as const;

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
