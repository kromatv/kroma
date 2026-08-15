// The free-text sweep, on the request page. Nothing here is scored against the
// request: the admin types what they want -- this title under another name, a
// season the request never covered, a film the library has never heard of -- and
// grabs a row straight into the import pipeline.
//
// One decision leads: WHAT is being hunted. The numbers belong to it and appear
// only where they mean something, and the line under the field says what the
// indexers will actually be asked, because the numbers change that silently.

import { apiErrorText } from '@kroma/core';
import { useT } from '@kroma/module-sdk';
import {
  Box,
  Button,
  Callout,
  EmptyState,
  Field,
  Row,
  SegmentGroup,
  TableSkeleton,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { useAcquisitionApi } from './api';
import { defaultTarget, needsEpisode, needsSeason, queryPreview } from './free-search-target';
import { IndexerReportStrip } from './indexer-report';
import { ManualReleaseTable } from './manual-release-table';
import type { ManualReleaseView } from './schemas';
import { useFreeSearch } from './use-free-search';

const NUMBER_W = 88;

export function RequestFreeSearch({
  title,
  kind,
  season,
  canGrab,
}: Readonly<{
  /** What the field starts on: the request's own title, so the common case is
   *  one keystroke away and anything else is a rewrite. */
  title: string;
  /** Which target to open on. Only a default -- a film request can still be used
   *  to hunt an episode of something else entirely, which is the point of a
   *  free search. */
  kind: 'movie' | 'show';
  /** The season the catalogue was showing, so switching over keeps the aim. */
  season: number | null;
  canGrab: boolean;
}>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const search = useFreeSearch(acquisition, title, defaultTarget(kind), season);
  const [grabbed, setGrabbed] = useState<{ text: string; error: boolean } | null>(null);
  const preview = queryPreview(search.query, search.target, search.season, search.episode);

  const grab = (release: ManualReleaseView) => {
    setGrabbed(null);
    search.setGrabbing(release.guid);
    acquisition
      .add(bodyFor(release))
      .then(() => setGrabbed({ text: `${t('requests.grabbed')} ${release.title}`, error: false }))
      .catch((e) => setGrabbed({ text: apiErrorText(e, t('requests.actionFailed')), error: true }))
      .finally(() => search.setGrabbing(null));
  };

  return (
    <Box gap={14}>
      <Row wrap between gap={12} align="flex-start">
        <Box flex minW={160}>
          <Text variant="title" accessibilityRole="header">
            {t('requests.freeSearch')}
          </Text>
          <Text variant="meta" color="textDim" mt={2}>
            {t('requests.freeSearchHint')}
          </Text>
        </Box>
        <Box shrink={0}>
          <SegmentGroup.Root
            value={search.target}
            onValueChange={search.pickTarget}
            label={t('requests.freeTarget')}
          >
            <SegmentGroup.Item value="movie">
              <SegmentGroup.Label>{t('requests.targetMovie')}</SegmentGroup.Label>
            </SegmentGroup.Item>
            <SegmentGroup.Item value="season">
              <SegmentGroup.Label>{t('requests.targetSeason')}</SegmentGroup.Label>
            </SegmentGroup.Item>
            <SegmentGroup.Item value="episode">
              <SegmentGroup.Label>{t('requests.targetEpisode')}</SegmentGroup.Label>
            </SegmentGroup.Item>
          </SegmentGroup.Root>
        </Box>
      </Row>

      <Box gap={6}>
        <Row wrap gap={8} align="flex-end">
          <Box flex minW={200}>
            <Field.Root
              label={t('requests.freeSearchLabel')}
              hideLabel
              value={search.query}
              onValueChange={search.setQuery}
            >
              <Field.Input
                icon="search"
                onSubmit={search.run}
                placeholder={t('requests.freeSearchPlaceholder')}
              />
            </Field.Root>
          </Box>
          {needsSeason(search.target) ? (
            <Box w={NUMBER_W}>
              <Field.Root
                label={t('requests.colSeasonShort')}
                value={search.season}
                onValueChange={search.setSeason}
              >
                <Field.Input type="number" onSubmit={search.run} placeholder="1" />
              </Field.Root>
            </Box>
          ) : null}
          {needsEpisode(search.target) ? (
            <Box w={NUMBER_W}>
              <Field.Root
                label={t('requests.colEpisodeShort')}
                value={search.episode}
                onValueChange={search.setEpisode}
              >
                <Field.Input type="number" onSubmit={search.run} placeholder="1" />
              </Field.Root>
            </Box>
          ) : null}
          <Button
            size="sm"
            icon="search"
            label={t('requests.searchNow')}
            onPress={search.run}
            loading={search.busy}
            disabled={!search.ready}
          />
        </Row>
        {preview ? (
          <Text variant="meta" color="textDim">
            {t('requests.freeSearchWillAsk', { query: preview })}
          </Text>
        ) : null}
      </Box>

      {search.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{search.error}</Callout.Title>
        </Callout.Root>
      ) : null}
      {grabbed ? (
        <Callout.Root tone={grabbed.error ? 'danger' : 'success'}>
          <Callout.Title>{grabbed.text}</Callout.Title>
        </Callout.Root>
      ) : null}

      {search.busy ? <TableSkeleton rows={5} /> : null}
      {!search.busy && search.view == null && !search.error ? (
        <EmptyState.Root icon="search">
          <EmptyState.Title>{t('requests.freeSearchIdle')}</EmptyState.Title>
          <EmptyState.Hint>{t('requests.freeSearchIdleHint')}</EmptyState.Hint>
        </EmptyState.Root>
      ) : null}
      {!search.busy && search.view ? (
        <Box gap={12}>
          <IndexerReportStrip indexers={search.view.indexers} />
          <ManualReleaseTable
            releases={search.view.releases}
            canGrab={canGrab}
            grabbing={search.grabbing}
            onGrab={grab}
          />
        </Box>
      ) : null}
    </Box>
  );
}

function kindOf(r: ManualReleaseView): 'season' | 'episode' | 'movie' {
  if (r.fullSeason) return 'season';
  return r.episode != null ? 'episode' : 'movie';
}

// What the release itself says it is. A pasted magnet needs a form; a row from
// the sweep has already been parsed, so the kind and the numbers come from it.
function bodyFor(r: ManualReleaseView) {
  const kind = kindOf(r);
  return {
    magnetOrUrl: r.downloadUrl ?? r.detailsUrl ?? '',
    kind,
    title: r.parsedTitle || null,
    year: r.year,
    season: kind === 'movie' ? null : r.season,
    episode: kind === 'episode' ? r.episode : null,
    tmdbId: null,
    onlyFiles: null,
    detailsUrl: r.detailsUrl,
  };
}
