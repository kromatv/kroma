// Choosing which title a torrent is for.

import { useT } from '@kromatv/module-sdk';
import { Box, Button, EmptyState, Field, Row, Spinner } from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
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

interface Answer {
  request: object;
  kind: string;
  year: number | null;
  results: MatchCandidateView[];
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
  const [request, setRequest] = useState({ text: initialQuery.trim() });
  const [seenInitial, setSeenInitial] = useState(initialQuery);
  const [answer, setAnswer] = useState<Answer | null>(null);
  if (seenInitial !== initialQuery) {
    setSeenInitial(initialQuery);
    setRequest({ text: initialQuery.trim() });
  }
  const answered =
    answer !== null &&
    answer.request === request &&
    answer.kind === kind &&
    answer.year === (year ?? null);
  const searching = request.text !== '' && !answered;
  const results = answer?.results ?? null;

  const search = (text: string) => {
    const words = text.trim();
    if (words) setRequest({ text: words });
  };

  useEffect(() => {
    if (!request.text) return;
    let stale = false;
    torrents
      .searchTitles(request.text, kind, year ?? undefined)
      .then((view) => view.results)
      .catch(() => [])
      .then((found) => {
        if (!stale) setAnswer({ request, kind, year: year ?? null, results: found });
      });
    return () => {
      stale = true;
    };
  }, [torrents, request, kind, year]);

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
