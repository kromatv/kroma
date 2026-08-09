import { TITLE_LETTERS } from '@kroma/core';
import { useT } from '@kroma/ui';
import type { LetterRange } from '@kroma/ui/kit';
import { AlphabetRail as Rail } from '@kroma/ui/kit';

export type { LetterRange };

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
  return (
    <nav
      aria-label={t('browse.letterNav')}
      className="fixed inset-y-0 right-2.5 z-30 my-auto hidden h-fit select-none touch-none sm:block"
    >
      <Rail
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
