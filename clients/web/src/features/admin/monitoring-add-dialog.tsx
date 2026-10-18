import { apiErrorText } from '@kromatv/client';
import type { TitleRef } from '@kromatv/client/monitoring';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  Dialog,
  EmptyState,
  Field,
  ListRow,
  SegmentGroup,
  Spinner,
  Text,
} from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AddOptions, type AddSettings } from '#web/features/admin/monitoring-add-options';
import { CandidateRow, CandidatesSkeleton } from '#web/features/admin/monitoring-candidate-row';
import { useDiscoveredTitles } from '#web/features/admin/monitoring-discover';
import {
  type MonitorCandidate,
  monitorCandidates,
  searchCandidates,
} from '#web/features/admin/monitoring-model';
import { useAuth } from '#web/shared/lib/auth';

const SHOWN = 150;

type Source = 'library' | 'tmdb';

const FRESH: AddSettings = {
  preset: 'all',
  monitorSpecials: false,
  minAvailability: 'released',
  searchNow: false,
};

const keyOf = (title: TitleRef) => `${title.kind}:${title.tmdbId}`;

export function MonitorTitlesDialog({
  open,
  monitored,
  onClose,
  onDone,
}: Readonly<{
  open: boolean;
  monitored: readonly TitleRef[];
  onClose: () => void;
  onDone: (message: string) => void;
}>) {
  const t = useT();
  const { client } = useAuth();
  const [source, setSource] = useState<Source>('library');
  const [picked, setPicked] = useState<ReadonlyMap<string, MonitorCandidate>>(() => new Map());
  const [needle, setNeedle] = useState('');
  const [settings, setSettings] = useState<AddSettings>(FRESH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);

  const { data: library } = useQuery({
    queryKey: ['admin', 'monitoring', 'catalog'],
    queryFn: async () => {
      const [movies, shows] = await Promise.all([client.media.movies(), client.media.shows()]);
      return { movies, shows };
    },
    enabled: open && source === 'library',
    staleTime: 60_000,
  });

  const candidates = useMemo(
    () => (library ? monitorCandidates(library.movies, library.shows, monitored) : []),
    [library, monitored],
  );
  const matching = useMemo(() => searchCandidates(candidates, needle), [candidates, needle]);
  const discovered = useDiscoveredTitles(needle, open && source === 'tmdb');
  const taken = useMemo(() => new Set(monitored.map(keyOf)), [monitored]);
  const shown =
    source === 'library'
      ? matching.slice(0, SHOWN)
      : (discovered.results ?? []).filter((entry) => !taken.has(keyOf(entry)));

  const chosen = [...picked.values()];
  const shows = chosen.some((entry) => entry.kind === 'show');
  const films = chosen.some((entry) => entry.kind === 'movie');

  const close = () => {
    setPicked(new Map());
    setNeedle('');
    setError(null);
    setRefused([]);
    onClose();
  };

  const toggle = (candidate: MonitorCandidate) =>
    setPicked((previous) => {
      const next = new Map(previous);
      const key = keyOf(candidate);
      if (next.has(key)) next.delete(key);
      else next.set(key, candidate);
      return next;
    });

  const pickSource = (next: Source) => {
    setSource(next);
    setNeedle('');
  };

  const monitor = () => {
    setBusy(true);
    setError(null);
    setRefused([]);
    client.monitoring
      .bulk(
        chosen.map(({ kind, tmdbId }) => ({ kind, tmdbId })),
        settings,
      )
      .then((result) => {
        setPicked(new Map());
        setRefused(
          result.failed.map((ref) =>
            t('monitoring.bulkFailedRow', {
              title: chosen.find((candidate) => keyOf(candidate) === keyOf(ref))?.title ?? '',
              reason: ref.error,
            }),
          ),
        );
        onDone(t('monitoring.bulkDone', { count: result.monitored }));
      })
      .catch((cause: unknown) => setError(apiErrorText(cause, t('monitoring.actionFailed'))))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog.Root open={open} onClose={close} width="lg" title={t('monitoring.addTitle')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('monitoring.addTitle')}
        </Text>
      </Dialog.Header>

      <Dialog.Panel>
        <Box gap={14}>
          <SegmentGroup.Root
            value={source}
            onValueChange={pickSource}
            label={t('monitoring.addTitle')}
          >
            <SegmentGroup.Item value="library">
              <SegmentGroup.Label>{t('monitoring.addLibrary')}</SegmentGroup.Label>
            </SegmentGroup.Item>
            <SegmentGroup.Item value="tmdb">
              <SegmentGroup.Label>{t('monitoring.addExternal')}</SegmentGroup.Label>
            </SegmentGroup.Item>
          </SegmentGroup.Root>

          <Field.Root
            label={source === 'library' ? t('monitoring.addSearch') : t('monitoring.addExternal')}
            hideLabel
            value={needle}
            onValueChange={setNeedle}
          >
            <Field.Input
              icon="search"
              placeholder={
                source === 'library'
                  ? t('monitoring.addSearchPlaceholder')
                  : t('monitoring.addExternalPlaceholder')
              }
              trailing={discovered.busy ? <Spinner size={16} /> : null}
            />
          </Field.Root>

          {(error ?? discovered.error) ? (
            <Callout.Root tone="danger">
              <Callout.Title>{error ?? discovered.error}</Callout.Title>
            </Callout.Root>
          ) : null}

          {refused.length > 0 ? (
            <Callout.Root tone="accent" icon="alert-triangle">
              <Callout.Title>{t('monitoring.bulkFailed', { count: refused.length })}</Callout.Title>
              <Callout.Detail>{refused.join('\n')}</Callout.Detail>
            </Callout.Root>
          ) : null}

          {shown.length > 0 ? (
            <ListRow.Group>
              {shown.map((candidate) => (
                <CandidateRow
                  key={keyOf(candidate)}
                  candidate={candidate}
                  picked={picked.has(keyOf(candidate))}
                  onToggle={() => toggle(candidate)}
                />
              ))}
            </ListRow.Group>
          ) : (
            <NothingShown
              source={source}
              loading={source === 'library' ? library === undefined : discovered.busy}
              searched={needle.trim().length > 0}
              offers={candidates.length > 0}
              answered={discovered.results !== null}
            />
          )}

          {source === 'library' && matching.length > shown.length ? (
            <Text variant="meta" color="textDim">
              {t('monitoring.addMore', { count: matching.length - shown.length })}
            </Text>
          ) : null}

          <AddOptions settings={settings} shows={shows} films={films} onChange={setSettings} />
        </Box>
      </Dialog.Panel>

      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.close')} onPress={close} />
          <Button
            icon="radar"
            label={t('monitoring.addConfirm', { count: picked.size })}
            onPress={monitor}
            loading={busy}
            disabled={picked.size === 0}
          />
        </Dialog.Actions>
      </Dialog.Footer>
    </Dialog.Root>
  );
}

function NothingShown({
  source,
  loading,
  searched,
  offers,
  answered,
}: Readonly<{
  source: Source;
  loading: boolean;
  searched: boolean;
  offers: boolean;
  answered: boolean;
}>) {
  const t = useT();
  if (loading) return <CandidatesSkeleton />;
  if (source === 'tmdb') {
    if (!searched) {
      return (
        <EmptyState.Root icon="search">
          <EmptyState.Title>{t('monitoring.addExternalIdle')}</EmptyState.Title>
        </EmptyState.Root>
      );
    }
    if (!answered) return null;
    return (
      <EmptyState.Root icon="search">
        <EmptyState.Title>{t('monitoring.addExternalNothing')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  if (!offers) {
    return (
      <EmptyState.Root icon="circle-check">
        <EmptyState.Title>{t('monitoring.addEmpty')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    <EmptyState.Root icon="search">
      <EmptyState.Title>{t('monitoring.addNoMatch')}</EmptyState.Title>
    </EmptyState.Root>
  );
}
