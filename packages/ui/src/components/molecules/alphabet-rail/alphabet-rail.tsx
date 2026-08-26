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
import { useStableCallback } from '#ui/lib/stable-callback';
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

interface AlphabetRailRootProps {
  /** Accessible name of the rail. */
  label: string;
  /** The stretch of buckets whose sections are on screen: where the lens sits.
   *  It is the HOST's scroll, not the rail's own state. */
  range?: LetterRange;
  onJump: (letter: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Only a DIRECT <AlphabetRail.Item> child takes a row. */
  children: ReactNode;
}

/** The vertical sibling of the NavPill: a glass capsule of letters, an amber
 * lens over the letters on screen, and (under a finger or pointer drag) a
 * bubble naming the letter being scrubbed to. The host owns the list and the
 * scroll; the rail only reports jumps. */
function Root({ label, range, onJump, style, children }: Readonly<AlphabetRailRootProps>) {
  // Rows scale with the viewport so the full alphabet always fits, capped
  // where the letters stop gaining legibility.
  const { height: winH } = useWindowDimensions();
  const rowH = Math.round(clampNum(19, winH * 0.03, 31));
  const fontSize = Math.round(clampNum(12, winH * 0.019, 17));

  const slots = useMemo(() => slotsOf(children), [children]);

  const rail = useRef<View>(null);
  const { bubble, panHandlers } = useLetterScrub(rail, slots, rowH, onJump);

  // Not `useEffectEvent`: React returns a new closure from that on every render,
  // so every letter's `onPress` would move and the whole rail would rebuild
  // under a lens that only touched three of them.
  const jump = useStableCallback(onJump);
  const lit = rangeIndices(slots, range);
  // Left to the React Compiler, which memoises this on the inputs it actually
  // reads. A hand-written `useMemo` here would key on a `lit` array rebuilt
  // every render, and so never hit at all.
  const context: AlphabetRailState = {
    indexOf: (value) => slots.findIndex((slot) => slot.value === value),
    lit,
    rowH,
    fontSize,
    jump,
  };

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
        {children}
        {bubble ? <Bubble letter={bubble.letter} y={bubble.y} /> : null}
      </Box>
    </AlphabetRailContext.Provider>
  );
}

/**
 * The fast-scroll rail for a long alphabetical list.
 *
 * ```tsx
 * <AlphabetRail.Root label="A-Z" range={visible} onJump={scrollToLetter}>
 *   {TITLE_LETTERS.map((letter) => (
 *     <AlphabetRail.Item
 *       key={letter}
 *       value={letter}
 *       disabled={!inView.has(letter)}
 *       label={t('browse.jumpToLetter', { letter })}
 *     />
 *   ))}
 * </AlphabetRail.Root>
 * ```
 */
const AlphabetRail = { Root, Item };

export type { AlphabetItemProps, AlphabetRailRootProps, LetterRange };
export { AlphabetRail };
