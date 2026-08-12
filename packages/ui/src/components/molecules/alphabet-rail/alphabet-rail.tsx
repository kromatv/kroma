// The A-Z fast-scroll rail beside a long alphabetical list: a vertical capsule
// of letters whose amber lens covers the stretch currently on screen, with a
// bubble echoing the letter under a scrubbing finger. The lens moves with the
// NavPill's motion: it is the same "lens travels to the current section" idea
// turned vertical.
//
// The Root walks its direct <AlphabetRail.Item> children once - the same shape
// <ListRow> takes - because a scrub is a hit test over POSITIONS, and a letter
// cannot know where it sits in a rail it cannot see.

import { Children, isValidElement, type ReactNode, useMemo, useRef } from 'react';
import { type StyleProp, useWindowDimensions, type View, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import {
  AlphabetRailContext,
  type AlphabetRailState,
  type LetterRange,
  PAD,
} from './alphabet-rail-context';
import { type AlphabetItemProps, Item } from './alphabet-rail-item';
import { Bubble, Lens, lensFor } from './alphabet-rail-lens';
import { clampNum, type Slot, useLetterScrub } from './use-letter-scrub';

function slotsOf(children: ReactNode): Slot[] {
  const out: Slot[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child) || child.type !== Item) continue;
    const props = child.props as AlphabetItemProps;
    out.push({ value: props.value, present: props.disabled !== true });
  }
  return out;
}

function rangeIndices(slots: readonly Slot[], range: LetterRange | undefined) {
  if (!range) return null;
  const first = slots.findIndex((slot) => slot.value === range.first);
  const last = slots.findIndex((slot) => slot.value === range.last);
  if (first < 0 || last < first) return null;
  return [first, last] as [number, number];
}

interface RootBase {
  /** Accessible name of the rail. */
  label: string;
  /** The stretch of buckets whose sections are on screen: where the lens sits.
   *  It is the HOST's scroll, not the rail's own state. */
  range?: LetterRange;
  onJump: (letter: string) => void;
  style?: StyleProp<ViewStyle>;
}

interface ComposedRootProps extends RootBase {
  /** Only a DIRECT <AlphabetRail.Item> child takes a row. */
  children: ReactNode;
  letters?: never;
  available?: never;
  letterLabel?: never;
}

interface SugarRootProps extends RootBase {
  /** Sugar for one <AlphabetRail.Item> per bucket in rail order (for the
   *  catalogue: '#', 'A' … 'Z'), which is what every rail so far wants. */
  letters: readonly string[];
  /** Which of those buckets the list carries. The rest render dimmed. */
  available: ReadonlySet<string>;
  /** Accessible name of one letter's jump. */
  letterLabel?: (letter: string) => string;
  children?: never;
}

type AlphabetRailRootProps = ComposedRootProps | SugarRootProps;

/** The vertical sibling of the NavPill: a glass capsule of letters, an amber
 * lens over the letters on screen, and (under a finger or pointer drag) a
 * bubble naming the letter being scrubbed to. The host owns the list and the
 * scroll; the rail only reports jumps. */
function Root(props: Readonly<AlphabetRailRootProps>) {
  const { label, range, onJump, style, letters, available, letterLabel, children } = props;

  // Rows scale with the viewport so the full alphabet always fits, capped
  // where the letters stop gaining legibility.
  const { height: winH } = useWindowDimensions();
  const rowH = Math.round(clampNum(19, winH * 0.03, 31));
  const fontSize = Math.round(clampNum(12, winH * 0.019, 17));

  const rows = useMemo(
    () =>
      children ??
      letters?.map((letter) => (
        <Item
          key={letter}
          value={letter}
          disabled={!available?.has(letter)}
          label={letterLabel?.(letter)}
        />
      )),
    [children, letters, available, letterLabel],
  );
  const slots = useMemo(() => slotsOf(rows), [rows]);

  const rail = useRef<View>(null);
  const { bubble, panHandlers } = useLetterScrub(rail, slots, rowH, onJump);

  const jump = useRef(onJump);
  jump.current = onJump;
  const lit = rangeIndices(slots, range);
  const context = useMemo<AlphabetRailState>(
    () => ({
      indexOf: (value) => slots.findIndex((slot) => slot.value === value),
      lit,
      rowH,
      fontSize,
      jump: (letter) => jump.current(letter),
    }),
    [slots, lit, rowH, fontSize],
  );

  return (
    <AlphabetRailContext.Provider value={context}>
      <Box
        ref={rail}
        {...panHandlers}
        accessibilityLabel={label}
        radius="pill"
        border="borderStrong"
        bg="surface1/78"
        p={PAD}
        style={style}
      >
        <Lens box={lit ? lensFor(lit, rowH) : null} chase={bubble !== null} />
        {rows}
        {bubble ? <Bubble letter={bubble.letter} y={bubble.y} /> : null}
      </Box>
    </AlphabetRailContext.Provider>
  );
}

/**
 * The fast-scroll rail for a long alphabetical list.
 *
 * ```tsx
 * <AlphabetRail.Root
 *   letters={TITLE_LETTERS}
 *   available={inView}
 *   range={visible}
 *   onJump={scrollToLetter}
 *   label={t('browse.letterNav')}
 *   letterLabel={(letter) => t('browse.jumpToLetter', { letter })}
 * />
 *
 * <AlphabetRail.Root label="A-Z" range={visible} onJump={scrollToLetter}>
 *   <AlphabetRail.Item value="#" label="Jump to #" />
 *   <AlphabetRail.Item value="A" label="Jump to A" />
 *   <AlphabetRail.Item value="B" disabled />
 * </AlphabetRail.Root>
 * ```
 */
const AlphabetRail = { Root, Item };

export type { AlphabetItemProps, AlphabetRailRootProps, LetterRange };
export { AlphabetRail };
