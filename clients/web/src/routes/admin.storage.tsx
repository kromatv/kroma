import type { Volume } from '@kroma/core';
import { useFormat, useT } from '@kroma/ui';
import {
  Box,
  Button,
  confirm,
  EmptyState,
  Grid,
  Icon,
  ListRow,
  Progress,
  Section,
  Select,
  StatCard,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { TextStyle } from 'react-native';
import { PageHeader, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

export const Route = createFileRoute('/admin/storage')({
  component: StoragePage,
});

function StoragePage() {
  const t = useT();
  const fmt = useFormat();
  const { client } = useAuth();
  const { data, reload } = usePoll(['admin', 'storage'], () => client.adminStorage(), 10000);
  const [clearing, setClearing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const pctUsed = data?.totalBytes ? Math.round((data.usedBytes / data.totalBytes) * 100) : 0;
  const cache = data?.cache;
  const enriched = (cache?.enrichedItems ?? 0) + (cache?.enrichedShows ?? 0);

  async function clearCache() {
    setClearing(true);
    try {
      await client.clearCache();
      reload();
    } finally {
      setClearing(false);
    }
  }

  async function resetMetadata() {
    const ok = await confirm({
      title: t('admin.resetMetadata'),
      message: t('admin.resetMetadataConfirm'),
      confirmLabel: t('admin.resetMetadataBtn'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    try {
      await client.resetMetadata();
      reload();
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.storageTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.storageSub')}</PageHeader.Subtitle>
      </PageHeader.Root>

      <Box mt={24}>
        <Grid columns={3} gap={16}>
          <StatCard.Root>
            <StatCard.Label>{t('admin.totalCapacity')}</StatCard.Label>
            <StatCard.Value>{fmt.bytes(data?.totalBytes ?? 0)}</StatCard.Value>
          </StatCard.Root>
          <StatCard.Root>
            <StatCard.Label>{t('admin.used')}</StatCard.Label>
            <StatCard.Value unit={`${pctUsed}%`} color="accent">
              {fmt.bytes(data?.usedBytes ?? 0)}
            </StatCard.Value>
          </StatCard.Root>
          <StatCard.Root>
            <StatCard.Label>{t('admin.available')}</StatCard.Label>
            <StatCard.Value color="success">{fmt.bytes(data?.availableBytes ?? 0)}</StatCard.Value>
          </StatCard.Root>
        </Grid>
      </Box>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.volumes')}</Section.Title>
        </Section.Header>
        <Box gap={14}>
          {(data?.volumes ?? []).map((v) => (
            <VolumeCard key={v.mount} v={v} />
          ))}
          {data?.volumes.length === 0 ? (
            <EmptyState.Root icon="database">
              <EmptyState.Title>{t('admin.noVolumes')}</EmptyState.Title>
            </EmptyState.Root>
          ) : null}
        </Box>
      </Section.Root>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.cacheContent')}</Section.Title>
        </Section.Header>
        <Grid columns={4} gap={16}>
          <StatCard.Root>
            <StatCard.Label>{t('admin.transcodeCacheSize')}</StatCard.Label>
            <StatCard.Value
              unit={t('admin.transcodeCacheBudget', { limit: cache?.transcodeLimit ?? '20 Go' })}
              color="accent"
            >
              {fmt.bytes(cache?.transcodeBytes ?? 0)}
            </StatCard.Value>
          </StatCard.Root>
          <StatCard.Root>
            <StatCard.Label>{t('admin.cachedImages')}</StatCard.Label>
            <StatCard.Value unit={fmt.bytes(cache?.imagesBytes ?? 0)} color="accent">
              {(cache?.imagesCount ?? 0).toLocaleString()}
            </StatCard.Value>
          </StatCard.Root>
          <StatCard.Root>
            <StatCard.Label>{t('admin.enrichedTitles')}</StatCard.Label>
            <StatCard.Value
              unit={t('admin.enrichedBreakdown', {
                movies: cache?.enrichedItems ?? 0,
                shows: cache?.enrichedShows ?? 0,
              })}
              color="success"
            >
              {enriched.toLocaleString()}
            </StatCard.Value>
          </StatCard.Root>
          <StatCard.Root>
            <StatCard.Label>{t('admin.cacheEmbeddings')}</StatCard.Label>
            <StatCard.Value>{(cache?.embeddings ?? 0).toLocaleString()}</StatCard.Value>
          </StatCard.Root>
        </Grid>
      </Section.Root>

      <Section.Root mt={28}>
        <Section.Header>
          <Section.Title>{t('admin.cacheMaintenance')}</Section.Title>
        </Section.Header>
        <ListRow.Group size="md">
          <MaintRow
            title={t('admin.transcodeCacheFolder')}
            desc={t('admin.transcodeCacheFolderDesc')}
            right={
              <Box radius="xs" border="borderStrong" bg="surface2" px={12} py={8}>
                <Text variant="meta">{data?.cache.dir ?? '-'}</Text>
              </Box>
            }
          />
          <MaintRow
            title={t('admin.cacheLimit')}
            desc={t('admin.cacheLimitDesc')}
            right={
              <LimitSelect
                label={t('admin.cacheLimit')}
                value={data?.cache.limit ?? '80 Go'}
                options={['40 Go', '80 Go', '120 Go', '256 Go', t('opt.unlimited')]}
                onChange={(v) => client.updateSettings({ cacheLimit: v }).then(reload)}
              />
            }
          />
          <MaintRow
            title={t('admin.transcodeCacheLimit')}
            desc={t('admin.transcodeCacheLimitDesc')}
            right={
              <LimitSelect
                label={t('admin.transcodeCacheLimit')}
                value={data?.cache.transcodeLimit ?? '20 Go'}
                options={['10 Go', '20 Go', '50 Go', '100 Go', t('opt.unlimited')]}
                onChange={(v) => client.updateSettings({ transcodeCacheLimit: v }).then(reload)}
              />
            }
          />
          <MaintRow
            title={t('admin.clearCache')}
            desc={t('admin.clearCacheDesc', { size: fmt.bytes(data?.cache.bytes ?? 0) })}
            right={
              <Button
                variant="danger"
                size="sm"
                label={clearing ? t('admin.clearing') : t('admin.clearNow')}
                onPress={() => void clearCache()}
                loading={clearing}
              />
            }
          />
          <MaintRow
            title={t('admin.resetMetadata')}
            desc={t('admin.resetMetadataDesc')}
            right={
              <Button
                variant="danger"
                size="sm"
                label={resetting ? t('admin.resetting') : t('admin.resetMetadataBtn')}
                onPress={() => void resetMetadata()}
                loading={resetting}
              />
            }
          />
        </ListRow.Group>
      </Section.Root>
    </>
  );
}

function LimitSelect({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}>) {
  const all = options.includes(value) ? options : [value, ...options];
  return (
    <Select.Root label={label} value={value} onValueChange={onChange}>
      <Select.Trigger />
      {all.map((o) => (
        <Select.Item key={o} value={o} label={o} />
      ))}
    </Select.Root>
  );
}

function VolumeCard({ v }: Readonly<{ v: Volume }>) {
  const t = useT();
  const fmt = useFormat();
  const pct = v.totalBytes ? Math.round((v.usedBytes / v.totalBytes) * 100) : 0;
  const nearFull = pct >= 80;
  return (
    <Surface elevated pad="none" radius={16} border="border" px={22} py={18}>
      <Box row align="center" justify="space-between" gap={16} mb={12}>
        <Box row align="center" gap={14} minW={0}>
          <Box w={40} h={40} shrink={0} center radius="xs" bg="accentSoft">
            <Icon name="database" size={20} thickness={1.8} color="accent" />
          </Box>
          <Box minW={0}>
            <Text variant="cardTitle">{v.name || v.mount}</Text>
            <Text variant="meta" color="text/45" lines={1}>
              {v.mount} · {v.fs}
            </Text>
          </Box>
        </Box>
        <Box shrink={0} align="flex-end">
          <Text variant="label" style={FIGURES}>
            {fmt.bytes(v.usedBytes)}{' '}
            <Text variant="label" color="text/40" style={QUIET}>
              / {fmt.bytes(v.totalBytes)}
            </Text>
          </Text>
          <Text variant="meta" color={nearFull ? 'danger' : 'accent'}>
            {t('admin.pctUsed', { pct })}
          </Text>
        </Box>
      </Box>
      <Progress value={pct / 100} color={nearFull ? 'danger' : 'accent'} thickness={9} rounded />
    </Surface>
  );
}

const FIGURES: TextStyle = { fontVariant: ['tabular-nums'] };
const QUIET = { fontWeight: '500' } as const;

function MaintRow({
  title,
  desc,
  right,
}: Readonly<{ title: string; desc: string; right: React.ReactNode }>) {
  return (
    <ListRow.Root>
      <ListRow.Label>{title}</ListRow.Label>
      <ListRow.Hint>{desc}</ListRow.Hint>
      <ListRow.Trailing>{right}</ListRow.Trailing>
    </ListRow.Root>
  );
}
