// The candidate grid of the rematch modal: the probable matches, then the long
// shots, each band an even grid of same-sized cards.

import type { MatchCandidate, MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Section } from '@kroma/ui/kit';
import { useMemo } from 'react';
import { CandidateCard } from '#web/features/catalog/rematch-card';
import { type CandidateBand, rankCandidates } from '#web/features/catalog/rematch-ranking';
import { TileGrid } from '#web/features/catalog/tile-grid';

const BAND_LABEL: Record<CandidateBand, MessageKey> = {
  likely: 'rematch.groupLikely',
  other: 'rematch.groupOther',
};

export interface RematchResultsProps {
  results: readonly MatchCandidate[];
  /** The TMDB id being applied, `reset` while the pin is being cleared. */
  applying: number | 'reset' | null;
  onPick: (tmdbId: number) => void;
}

/** The ranked candidates, grouped by how much the matcher believes in them. */
export function RematchResults({ results, applying, onPick }: Readonly<RematchResultsProps>) {
  const t = useT();
  const groups = useMemo(() => rankCandidates(results), [results]);
  return (
    <Box gap={24}>
      {groups.map((group) => (
        <Section.Root key={group.band}>
          {groups.length > 1 ? (
            <Section.Header>
              <Section.Title>{t(BAND_LABEL[group.band])}</Section.Title>
            </Section.Header>
          ) : null}
          <TileGrid>
            {() =>
              group.items.map((candidate) => (
                <CandidateCard
                  key={candidate.tmdbId}
                  candidate={candidate}
                  busy={applying === candidate.tmdbId}
                  disabled={applying !== null}
                  onPick={() => onPick(candidate.tmdbId)}
                />
              ))
            }
          </TileGrid>
        </Section.Root>
      ))}
    </Box>
  );
}
