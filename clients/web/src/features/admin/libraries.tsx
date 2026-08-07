import type { AdminLibrary } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, EmptyState } from '@kroma/ui/kit';
import {
  IconDeviceTv,
  IconFolder,
  IconMovie,
  IconMusic,
  IconPhoto,
  type TablerIcon,
} from '@tabler/icons-react';
import { useState } from 'react';
import {
  AddLibraryModal,
  ManageLibraryModal,
  normalizeLibKind,
} from '#web/features/admin/libraries-modals';
import { Denied, HeaderAction, PageHeader, useCap, usePoll } from '#web/features/admin/shell';
import { Card } from '#web/features/admin/ui';
import { formatBytes, relativeSeen } from '#web/shared/lib/adminFormat';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const ICONS: Record<string, TablerIcon> = {
  film: IconMovie,
  tv: IconDeviceTv,
  music: IconMusic,
  photo: IconPhoto,
};

const KIND_LABEL = {
  '': 'admin.typeAuto',
  movies: 'admin.typeMovies',
  shows: 'admin.typeShows',
  mixed: 'admin.typeMixed',
} as const;

export function LibrariesScreen() {
  if (!useCap('library.manage')) return <Denied />;
  return <LibrariesPageInner />;
}

function LibrariesPageInner() {
  const t = useT();
  const { client } = useAuth();
  const { data, reload } = usePoll(['admin', 'libraries'], () => client.adminLibraries(), 8000);

  const openAdd = async () => {
    if (await AddLibraryModal.call()) reload();
  };
  const openManage = async (lib: AdminLibrary) => {
    if (await ManageLibraryModal.call({ lib })) reload();
  };

  const libraries = data?.libraries ?? [];

  return (
    <>
      <PageHeader
        title={t('admin.librariesTitle')}
        subtitle={t('admin.librariesSub')}
        action={<HeaderAction label={t('admin.addLibrary')} onClick={() => void openAdd()} />}
      />

      {data === null ? <TableSkeleton rows={4} /> : null}

      {libraries.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {libraries.map((l) => (
            <LibraryCard key={l.id} lib={l} onManage={() => void openManage(l)} />
          ))}
        </div>
      ) : null}
      {data && libraries.length === 0 ? (
        <EmptyState
          icon="library"
          title={t('admin.noLibraries')}
          action={<HeaderAction label={t('admin.addLibrary')} onClick={() => void openAdd()} />}
        />
      ) : null}
    </>
  );
}

function LibraryCard({
  lib,
  onManage,
}: Readonly<{
  lib: AdminLibrary;
  onManage: () => void;
}>) {
  const t = useT();
  const { client } = useAuth();
  const [scanning, setScanning] = useState(false);
  const accent = '#84CE7E';

  async function scan() {
    setScanning(true);
    try {
      await client.scanLibrary(lib.id);
    } finally {
      setTimeout(() => setScanning(false), 1200);
    }
  }

  const LibIcon = ICONS[lib.kind] ?? IconMovie;

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-3.5 border-b border-white/5 px-5 py-4.5"
        style={{ background: 'rgba(132,206,126,.07)' }}
      >
        <span
          className="flex h-11.5 w-11.5 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'rgba(132,206,126,.16)', color: accent }}
        >
          <LibIcon size={22} stroke={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[18px] font-bold">{lib.name}</div>
          <div className="text-[12px] font-semibold text-text/45">
            {t(KIND_LABEL[normalizeLibKind(lib.kind)])} ·{' '}
            {t('admin.itemsCount', { count: lib.itemCount })}
          </div>
        </div>
        {lib.autoScan ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/13 px-2.5 py-1 text-[11.5px] font-semibold text-success">
            {t('admin.autoScanBadge')}
          </span>
        ) : null}
      </div>

      <div className="flex items-stretch border-b border-white/5">
        <Stat label={t('admin.statSize')} value={formatBytes(lib.sizeBytes)} border />
        <Stat label={t('admin.statLastScan')} value={relativeSeen(lib.lastScan)} />
      </div>

      <div className="border-b border-white/5 px-5 pb-4 pt-3.5">
        <div className="mb-2 text-[9.5px] font-bold uppercase tracking-[.12em] text-text/38">
          {t('admin.scannedFolders')}
        </div>
        <div className="flex flex-col gap-1.5">
          {lib.folders.map((path) => (
            <div key={path} className="flex items-center gap-2">
              <IconFolder size={15} stroke={1.8} color={accent} className="shrink-0" />
              <span className="min-w-0 truncate text-[13px] font-semibold text-text/70">
                {path}
              </span>
            </div>
          ))}
          {lib.folders.length === 0 ? (
            <span className="text-[12.5px] text-dim">{t('admin.noFolders')}</span>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2.5 px-5 py-3.5">
        <Button
          size="sm"
          icon="refresh"
          label={scanning ? t('admin.scanning') : t('admin.scan')}
          onPress={() => void scan()}
          loading={scanning}
        />
        <Button variant="glass" size="sm" label={t('common.manage')} onPress={onManage} />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  border,
}: Readonly<{ label: string; value: string; border?: boolean }>) {
  return (
    <div className={`flex-1 px-5 py-3.5 ${border ? 'border-r border-white/5' : ''}`}>
      <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[.12em] text-text/38">
        {label}
      </div>
      <div className="text-[14px] font-semibold text-text/78">{value}</div>
    </div>
  );
}
