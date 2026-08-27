// Choosing which title a torrent is for.

import { useT } from '@kroma/module-sdk';
import { Box, Button, EmptyState, Field, Row, Spinner } from '@kroma/ui/kit';
import { useCallback, useEffect, useState } from 'react';
import { useTorrentsApi } from './api';
import { CandidateRow } from './candidate-row';
import type { MatchCandidateView } from './schemas';

interface TitlePickerProps {
  initialQuery: string;
  /** `movie` narrows to films, anything else to shows. */
  kind: string;
  year?: number | null;
  currentTmdbId?: number | null;
  onPick: (candidate: MatchCandidateView) => void;
  busy?: boolean;
}

export function TitlePicker({
  initialQuery,
  kind,
  year,
  currentTmdbId,
  onPick,
  busy = false,
}: Readonly<TitlePickerProps>) {
  const t = useT();
  const torrents = useTorrentsApi();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MatchCandidateView[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = useCallback(
    (text: string) => {
      const words = text.trim();
      if (!words) return;
      setSearching(true);
      torrents
        .searchTitles(words, kind, year ?? undefined)
        .then((view) => setResults(view.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    },
    [torrents, kind, year],
  );

  useEffect(() => search(initialQuery), [search, initialQuery]);

  return (
    <Box gap={10}>
      <Row gap={8}>
        <Field.Root
          label={t('downloads.linkSearchLabel')}
          hideLabel
          flex
          value={query}
          onValueChange={setQuery}
        >
          <Field.Input
            icon="search"
            placeholder={t('downloads.linkSearchPlaceholder')}
            onSubmit={() => search(query)}
          />
        </Field.Root>
        <Button
          variant="glass"
          icon="search"
          label={t('downloads.linkSearch')}
          onPress={() => search(query)}
          disabled={searching}
        />
      </Row>

      <Box gap={6} maxH={320} overflow="scroll">
        {searching ? (
          <Row center py={24}>
            <Spinner />
          </Row>
        ) : null}
        {!searching && results?.length === 0 ? (
          <Box py={20}>
            <EmptyState.Root icon="search-off">
              <EmptyState.Title>{t('downloads.linkNoResults')}</EmptyState.Title>
            </EmptyState.Root>
          </Box>
        ) : null}
        {!searching
          ? results?.map((candidate) => (
              <CandidateRow
                key={candidate.tmdbId}
                candidate={candidate}
                current={candidate.tmdbId === currentTmdbId}
                busy={busy}
                onPick={() => onPick(candidate)}
              />
            ))
          : null}
      </Box>
    </Box>
  );
}
