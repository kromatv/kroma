import type { RequestKind, SearchScope } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, Button, Field, Row, SegmentGroup } from '@kromatv/ui/kit';
import { useState } from 'react';
import { scopeOfTarget, type TitleTarget } from './title-scope';

const TARGETS: TitleTarget[] = ['all', 'season', 'episode'];

const TARGET_LABEL: Record<TitleTarget, string> = {
  all: 'requests.ledgerAll',
  season: 'requests.targetSeason',
  episode: 'requests.targetEpisode',
};

const NUMBER_W = 88;

export function TitleSearchBar({
  kind,
  busy,
  onSearch,
}: Readonly<{
  kind: RequestKind;
  busy: boolean;
  onSearch: (scope: SearchScope) => void;
}>) {
  const t = useT();
  const [target, setTarget] = useState<TitleTarget>('all');
  const [season, setSeason] = useState('1');
  const [episode, setEpisode] = useState('1');
  const scope = scopeOfTarget(kind, target, season, episode);
  const run = () => {
    if (scope) onSearch(scope);
  };

  return (
    <Row wrap gap={10} align="flex-end">
      {kind === 'show' ? (
        <>
          <SegmentGroup.Root
            value={target}
            onValueChange={setTarget}
            label={t('requests.freeTarget')}
            size="sm"
          >
            {TARGETS.map((one) => (
              <SegmentGroup.Item key={one} value={one}>
                <SegmentGroup.Label>{t(TARGET_LABEL[one])}</SegmentGroup.Label>
              </SegmentGroup.Item>
            ))}
          </SegmentGroup.Root>
          {target === 'all' ? null : (
            <Box w={NUMBER_W}>
              <Field.Root
                label={t('requests.colSeasonShort')}
                size="sm"
                value={season}
                onValueChange={setSeason}
              >
                <Field.Input type="number" onSubmit={run} placeholder="1" />
              </Field.Root>
            </Box>
          )}
          {target === 'episode' ? (
            <Box w={NUMBER_W}>
              <Field.Root
                label={t('requests.colEpisodeShort')}
                size="sm"
                value={episode}
                onValueChange={setEpisode}
              >
                <Field.Input type="number" onSubmit={run} placeholder="1" />
              </Field.Root>
            </Box>
          ) : null}
        </>
      ) : null}
      <Button
        size="sm"
        icon="search"
        label={t('requests.searchBetter')}
        loading={busy}
        disabled={scope === null}
        onPress={run}
      />
    </Row>
  );
}
