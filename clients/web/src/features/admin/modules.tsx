// Admin "Modules" page: an app-store view over /api/admin/modules and
// /api/admin/store. Discover / Installed / Updates tabs with live per-module
// install progress off the `module.op.*` stream, a detail page per module,
// and registry management in its own drawer.

import { useT } from '@kroma/ui';
import { Box, Button, Field, Row, SegmentGroup, Text } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { type CSSProperties, useMemo, useRef, useState } from 'react';

// The file input is a handle for the upload button, never a control a reader
// sees; `display: none` has no React Native spelling.
const HIDDEN: CSSProperties = { display: 'none' };

import { installBundle, message, updateModules } from '#web/features/admin/module-api';
import { useModuleData } from '#web/features/admin/module-data';
import { InstallModal } from '#web/features/admin/module-install';
import { InstalledList } from '#web/features/admin/module-installed';
import { useStoreOps } from '#web/features/admin/module-ops';
import { PointsList } from '#web/features/admin/module-points-list';
import { RegistriesDrawer } from '#web/features/admin/module-registries';
import { StoreGrid } from '#web/features/admin/module-store';
import { UpdatesList } from '#web/features/admin/module-updates';
import { Denied, PageHeader, useAsyncAction, useCap } from '#web/features/admin/shell';

type Tab = 'discover' | 'installed' | 'points' | 'updates';

export function ModulesAdminPage() {
  if (!useCap('settings.manage')) return <Denied />;
  return <ModulesInner />;
}

function ModulesInner() {
  const t = useT();
  const navigate = useNavigate();
  const { modules, catalog, refreshAll } = useModuleData();
  const { activeByModule } = useStoreOps();
  const [tab, setTab] = useState<Tab>('discover');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useAsyncAction();
  const updating = useAsyncAction();

  const installed = modules ?? [];
  const updates = useMemo(
    () => (catalog?.modules ?? []).filter((m) => m.updateAvailable && m.compatible),
    [catalog],
  );

  const openDetail = (id: string) => void navigate({ to: '/admin/modules/$id', params: { id } });

  const requestInstall = async (id: string) => {
    if (await InstallModal.call({ id })) void refreshAll();
  };

  const runUpdate = (ids?: string[]) =>
    void updating.run(async () => {
      const result = await updateModules(ids);
      await refreshAll();
      if (result.failed.length > 0) {
        throw new Error(result.failed.map((f) => `${f.id}: ${f.error}`).join(' · '));
      }
    }, message);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    void upload.run(async () => {
      await installBundle(file);
      await refreshAll();
    }, message);
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'discover', label: t('admin.modulesTabDiscover') },
    { value: 'installed', label: `${t('admin.modulesTabInstalled')} · ${installed.length}` },
    { value: 'points', label: t('admin.modulesTabPoints') },
    {
      value: 'updates',
      label:
        updates.length > 0
          ? `${t('admin.modulesTabUpdates')} · ${updates.length}`
          : t('admin.modulesTabUpdates'),
    },
  ];

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.modulesTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.modulesSub')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Row gap={8}>
            <Button
              variant="glass"
              label={t('admin.modulesRegistries')}
              icon="world"
              onPress={() =>
                void RegistriesDrawer.call({}).then((c) => {
                  if (c) void refreshAll();
                })
              }
            />
            <Button
              variant="glass"
              label={t('admin.modulesUpload')}
              icon="upload"
              onPress={() => fileRef.current?.click()}
              loading={upload.busy}
            />
          </Row>
        </PageHeader.Actions>
      </PageHeader.Root>
      <input
        ref={fileRef}
        type="file"
        accept=".kmod,.tar"
        style={HIDDEN}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {upload.error && (
        <Text variant="meta" color="danger" mt={12}>
          {upload.error}
        </Text>
      )}

      <Row wrap between gap={12} mt={24}>
        <SegmentGroup.Root value={tab} onValueChange={setTab}>
          {tabs.map((entry) => (
            <SegmentGroup.Item key={entry.value} value={entry.value}>
              <SegmentGroup.Label>{entry.label}</SegmentGroup.Label>
            </SegmentGroup.Item>
          ))}
        </SegmentGroup.Root>
        {tab !== 'updates' && (
          <Field.Root w={256} label={t('admin.modulesSearch')} hideLabel>
            <Field.Input
              type="search"
              icon="search"
              placeholder={t('admin.modulesSearch')}
              value={query}
              onValueChange={setQuery}
            />
          </Field.Root>
        )}
      </Row>

      <Box mt={20}>
        {tab === 'discover' && (
          <StoreGrid
            catalog={catalog}
            query={query}
            active={activeByModule}
            onOpen={openDetail}
            onInstall={(id) => void requestInstall(id)}
            onUpdate={(id) => runUpdate([id])}
          />
        )}
        {tab === 'installed' && (
          <InstalledList
            modules={modules}
            catalog={catalog}
            query={query}
            onOpen={openDetail}
            onChanged={() => void refreshAll()}
          />
        )}
        {tab === 'points' && <PointsList modules={modules} query={query} />}
        {tab === 'updates' && (
          <UpdatesList
            updates={updates}
            active={activeByModule}
            busy={updating.busy}
            error={updating.error}
            onUpdateAll={() => runUpdate()}
            onUpdate={(id) => runUpdate([id])}
            onOpen={openDetail}
          />
        )}
      </Box>
    </>
  );
}
