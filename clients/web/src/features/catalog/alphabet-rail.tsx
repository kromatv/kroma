import { TITLE_LETTERS } from '@kroma/core';
import { useT } from '@kroma/ui';
import type { LetterRange } from '@kroma/ui/kit';
import { AlphabetRail as Rail, useBreakpoint } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';

export type { LetterRange };

// Fixed to the viewport and centred in it: neither position is in the kit's
// vocabulary, which lays out inside a flow rather than against the window.
const RAIL_POSITION: CSSProperties = {
  position: 'fixed',
  top: 0,
  bottom: 0,
  right: 10,
  zIndex: 30,
  marginTop: 'auto',
  marginBottom: 'auto',
  height: 'fit-content',
  userSelect: 'none',
  touchAction: 'none',
};

export interface AlphabetRailProps {
  /** Buckets that exist in the current view; the rest render dimmed. */
  available: ReadonlySet<string>;
  /** The stretch of letters whose sections are on screen (title sort only). */
  range?: LetterRange;
  onJump: (letter: string) => void;
}

/** The kit's fast-scroll rail pinned down the right edge of the catalogue
 * grid. The kit component carries the letters, lens and scrubbing; this
 * wrapper decides where it lives on the web (fixed, vertically centred,
 * hidden on phones where the grid is short enough to flick). */
export function AlphabetRail({ available, range, onJump }: Readonly<AlphabetRailProps>) {
  const t = useT();
  // A phone flicks the grid instead; the rail is a pointer and a wide-screen
  // affordance, so below `md` it is not rendered at all.
  if (useBreakpoint() === 'base') return null;
  return (
    <nav aria-label={t('browse.letterNav')} style={RAIL_POSITION}>
      <Rail.Root
        letters={TITLE_LETTERS}
        available={available}
        range={range}
        onJump={onJump}
        label={t('browse.letterNav')}
        letterLabel={(letter) => t('browse.jumpToLetter', { letter })}
      />
    </nav>
  );
}
