import { apiErrorText } from '@kromatv/client';
import type { MinAvailability, MonitorPreset, TitleRef } from '@kromatv/client/monitoring';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  Dialog,
  Divider,
  EmptyState,
  Field,
  ListRow,
  Surface,
  Switch,
  Text,
} from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CandidateRow, CandidatesSkeleton } from '#web/features/admin/monitoring-candidate-row';
import {
  type MonitorCandidate,
  monitorCandidates,
  searchCandidates,
} from '#web/features/admin/monitoring-model';
import {
  AvailabilitySelect,
  PresetSelect,
  SettingRow,
} from '#web/features/admin/monitoring-options';
import { useAuth } from '#web/shared/lib/auth';

const SHOWN = 150;

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
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [needle, setNeedle] = useState('');
  const [preset, setPreset] = useState<MonitorPreset>('all');
  const [availability, setAvailability] = useState<MinAvailability>('released');
  const [searchNow, setSearchNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);

  const { data: library } = useQuery({
    queryKey: ['admin', 'monitoring', 'library'],
    queryFn: async () => {
      const [movies, shows] = await Promise.all([client.media.movies(), client.media.shows()]);
      return { movies, shows };
    },
    enabled: open,
    staleTime: 60_000,
  });

  const candidates = useMemo(
    () => (library ? monitorCandidates(library.movies, library.shows, monitored) : []),
    [library, monitored],
  );
  const matching = useMemo(() => searchCandidates(candidates, needle), [candidates, needle]);
  const shown = matching.slice(0, SHOWN);

  const close = () => {
    setPicked(new Set());
    setNeedle('');
    setError(null);
    setRefused([]);
    onClose();
  };

  const toggle = (candidate: MonitorCandidate) =>
    setPicked((previous) => {
      const next = new Set(previous);
      const key = keyOf(candidate);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const monitor = () => {
    const chosen = candidates.filter((candidate) => picked.has(keyOf(candidate)));
    setBusy(true);
    setError(null);
    setRefused([]);
    client.monitoring
      .bulk(
        chosen.map(({ kind, tmdbId }) => ({ kind, tmdbId })),
        { preset, minAvailability: availability, searchNow },
      )
      .then((result) => {
        setPicked(new Set());
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
      .catch((cause) => setError(apiErrorText(cause, t('monitoring.actionFailed'))))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog.Root open={open} onClose={close} width="lg" title={t('monitoring.addTitle')}>
      <Dialog.Header>
        <Text variant="title" accessibilityRole="header">
          {t('monitoring.addTitle')}
        </Text>
        <Text variant="meta" color="textDim" mt={6}>
          {t('monitoring.addHint')}
        </Text>
      </Dialog.Header>

      <Dialog.Panel>
        <Box gap={14}>
          <Surface pad="none" radius="xl" border="border" overflow="hidden">
            <SettingRow label={t('monitoring.preset')} hint={t('monitoring.presetHint')}>
              <PresetSelect value={preset} onChange={setPreset} />
            </SettingRow>
            <Divider spacing={0} />
            <SettingRow
              label={t('monitoring.minAvailability')}
              hint={t('monitoring.minAvailabilityHint')}
            >
              <AvailabilitySelect value={availability} onChange={setAvailability} />
            </SettingRow>
            <Divider spacing={0} />
            <SettingRow label={t('monitoring.searchNow')} hint={t('monitoring.searchNowHint')}>
              <Switch
                checked={searchNow}
                onCheckedChange={setSearchNow}
                label={t('monitoring.searchNow')}
              />
            </SettingRow>
          </Surface>

          <Field.Root label={t('monitoring.addSearch')} value={needle} onValueChange={setNeedle}>
            <Field.Input icon="search" placeholder={t('monitoring.addSearchPlaceholder')} />
          </Field.Root>

          {error ? (
            <Callout.Root tone="danger">
              <Callout.Title>{error}</Callout.Title>
            </Callout.Root>
          ) : null}

          {refused.length > 0 ? (
            <Callout.Root tone="accent" icon="alert-triangle">
              <Callout.Title>{t('monitoring.bulkFailed', { count: refused.length })}</Callout.Title>
              <Callout.Detail>{refused.join('\n')}</Callout.Detail>
            </Callout.Root>
          ) : null}

          {library === undefined ? <CandidatesSkeleton /> : null}

          {library && candidates.length === 0 ? (
            <EmptyState.Root icon="circle-check">
              <EmptyState.Title>{t('monitoring.addEmpty')}</EmptyState.Title>
              <EmptyState.Hint>{t('monitoring.addEmptyHint')}</EmptyState.Hint>
            </EmptyState.Root>
          ) : null}

          {candidates.length > 0 && matching.length === 0 ? (
            <EmptyState.Root icon="search">
              <EmptyState.Title>{t('monitoring.addNoMatch')}</EmptyState.Title>
            </EmptyState.Root>
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
          ) : null}

          {matching.length > shown.length ? (
            <Text variant="meta" color="textDim">
              {t('monitoring.addMore', { count: matching.length - shown.length })}
            </Text>
          ) : null}
        </Box>
      </Dialog.Panel>

      <Dialog.Footer>
        <Dialog.Actions>
          <Button variant="ghost" label={t('common.close')} onPress={close} />
          <Button
            icon="eye"
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
