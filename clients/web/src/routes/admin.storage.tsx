import type { Volume } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Button,
  confirm,
  EmptyState,
  ListRow,
  Progress,
  Section,
  Select,
  StatCard,
  Surface,
} from '@kroma/ui/kit';
import { IconDatabase } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader, usePoll } from '#web/features/admin/shell';
import { formatBytes } from '#web/shared/lib/adminFormat';
import { useAuth } from '#web/shared/lib/auth';

export const Route = createFileRoute('/admin/storage')({
  component: StoragePage,
});

function StoragePage() {
  const t = useT();
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
      <PageHeader.Root title={t('admin.storageTitle')} subtitle={t('admin.storageSub')} />

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label={t('admin.totalCapacity')} value={formatBytes(data?.totalBytes ?? 0)} />
        <StatCard
          label={t('admin.used')}
          value={formatBytes(data?.usedBytes ?? 0)}
          unit={`${pctUsed}%`}
          color="accent"
        />
        <StatCard
          label={t('admin.available')}
          value={formatBytes(data?.availableBytes ?? 0)}
          color="success"
        />
      </div>

      <Section.Root title={t('admin.volumes')} mt={28}>
        <div className="flex flex-col gap-3.5">
          {(data?.volumes ?? []).map((v) => (
            <VolumeCard key={v.mount} v={v} />
          ))}
          {data?.volumes.length === 0 ? (
            <EmptyState.Root icon="database" title={t('admin.noVolumes')} />
          ) : null}
        </div>
      </Section.Root>

      <Section.Root title={t('admin.cacheContent')} mt={28}>
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label={t('admin.transcodeCacheSize')}
            value={formatBytes(cache?.transcodeBytes ?? 0)}
            unit={t('admin.transcodeCacheBudget', { limit: cache?.transcodeLimit ?? '20 Go' })}
            color="accent"
          />
          <StatCard
            label={t('admin.cachedImages')}
            value={(cache?.imagesCount ?? 0).toLocaleString()}
            unit={formatBytes(cache?.imagesBytes ?? 0)}
            color="accent"
          />
          <StatCard
            label={t('admin.enrichedTitles')}
            value={enriched.toLocaleString()}
            unit={t('admin.enrichedBreakdown', {
              movies: cache?.enrichedItems ?? 0,
              shows: cache?.enrichedShows ?? 0,
            })}
            color="success"
          />
          <StatCard
            label={t('admin.cacheEmbeddings')}
            value={(cache?.embeddings ?? 0).toLocaleString()}
          />
        </div>
      </Section.Root>

      <Section.Root title={t('admin.cacheMaintenance')} mt={28}>
        <ListRow.Group size="md">
          <MaintRow
            title={t('admin.transcodeCacheFolder')}
            desc={t('admin.transcodeCacheFolderDesc')}
            right={
              <span className="rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-[13px] font-semibold text-text">
                {data?.cache.dir ?? '-'}
              </span>
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
            desc={t('admin.clearCacheDesc', { size: formatBytes(data?.cache.bytes ?? 0) })}
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
  const pct = v.totalBytes ? Math.round((v.usedBytes / v.totalBytes) * 100) : 0;
  const nearFull = pct >= 80;
  return (
    <Surface elevated pad="none" radius={16} border="border" px={22} py={18}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <IconDatabase size={20} stroke={1.8} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[16px] font-bold">{v.name || v.mount}</div>
            <div className="truncate text-[12.5px] font-semibold text-text/45">
              {v.mount} · {v.fs}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-bold tabular-nums">
            {formatBytes(v.usedBytes)}{' '}
            <span className="font-medium text-text/40">/ {formatBytes(v.totalBytes)}</span>
          </div>
          <div className={`text-[12px] font-semibold ${nearFull ? 'text-danger' : 'text-accent'}`}>
            {t('admin.pctUsed', { pct })}
          </div>
        </div>
      </div>
      <Progress value={pct / 100} color={nearFull ? 'danger' : 'accent'} size={9} rounded />
    </Surface>
  );
}

function MaintRow({
  title,
  desc,
  right,
}: Readonly<{ title: string; desc: string; right: React.ReactNode }>) {
  return (
    <ListRow.Root label={title} hint={desc}>
      <ListRow.Trailing>{right}</ListRow.Trailing>
    </ListRow.Root>
  );
}
