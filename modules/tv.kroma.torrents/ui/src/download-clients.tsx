// The "Clients de téléchargement" section of the downloads page: one card per
// engine (embedded / Transmission / qBittorrent) with enable toggle, live
// connection test and the add/edit modal.

import { addEngine, apiErrorText, useEnabledEngines, usePoll, useT } from '@kroma/module-sdk';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Section,
  Surface,
  Switch,
  TableSkeleton,
} from '@kroma/ui/kit';
import { IconCpu, IconServer } from '@tabler/icons-react';
import { useState } from 'react';
import { useTorrentsApi } from './api';
import { DownloadClientModal } from './download-client-modals';
import type { ClientTestResult, DownloadClientView } from './schemas';

type TestState = { busy?: boolean; result?: ClientTestResult; error?: string };

export function DownloadClientsSection() {
  const t = useT();
  const torrents = useTorrentsApi();
  const engines = useEnabledEngines('download-client');
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const { data, reload } = usePoll(['admin', 'downloadClients'], () => torrents.clients(), 30000);
  const clients = data?.clients ?? [];

  const openAdd = async () => {
    const changed = await addEngine({
      engines,
      title: t('dlclients.addTitle'),
      onSubmit: async (kind, v) => {
        await torrents.createClient({
          kind,
          name: v.name ?? null,
          url: v.url ?? null,
          username: v.username ?? null,
          password: v.password ?? null,
          enabled: true,
          priority: null,
        });
      },
    });
    if (changed) reload();
  };
  const openEdit = async (c: DownloadClientView) => {
    if (await DownloadClientModal.call({ client: c })) reload();
  };

  const toggle = (c: DownloadClientView, enabled: boolean) => {
    torrents
      .updateClient(c.id, {
        kind: null,
        name: null,
        url: null,
        username: null,
        password: null,
        enabled,
        priority: null,
      })
      .then(reload)
      .catch(() => reload());
  };
  const test = (c: DownloadClientView) => {
    setTests((s) => ({ ...s, [c.id]: { busy: true } }));
    torrents
      .testClient(c.id)
      .then((result) => setTests((s) => ({ ...s, [c.id]: { result } })))
      .catch((e) =>
        setTests((s) => ({ ...s, [c.id]: { error: apiErrorText(e, t('dlclients.testFailed')) } })),
      );
  };

  // One button reused by the section header and the empty state (only when an
  // external download-client engine is enabled).
  const addButton =
    engines.length > 0 ? (
      <Button
        variant="glass"
        size="sm"
        icon="plus"
        label={t('dlclients.add')}
        onPress={() => void openAdd()}
      />
    ) : null;

  return (
    <Section.Root title={t('dlclients.sectionTitle')} actions={addButton} mt={28}>
      {data === null ? <TableSkeleton rows={3} /> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {clients.map((c) => (
          <Surface key={c.id} elevated border="border" pad="none" p={18}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 flex-[0_0_40px] items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-accent">
                  {c.builtin ? (
                    <IconCpu size={18} stroke={1.8} />
                  ) : (
                    <IconServer size={18} stroke={1.8} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14.5px] font-bold">{c.name}</span>
                    <Badge tone="info">{c.builtin ? t('dlclients.embedded') : c.kind}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] font-medium text-dim">
                    {c.builtin ? t('dlclients.embeddedSub') : c.url}
                  </div>
                </div>
              </div>
              <Switch checked={c.enabled} onChange={(v) => toggle(c, v)} label={c.name} />
            </div>
            <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-white/6 pt-3">
              <TestLine test={tests[c.id]} />
              <div className="flex items-center gap-2">
                <Button
                  variant="glass"
                  size="sm"
                  label={t('dlclients.test')}
                  onPress={() => test(c)}
                  loading={tests[c.id]?.busy}
                />
                {!c.builtin ? (
                  <IconButton
                    icon="pencil"
                    label={t('dlclients.edit')}
                    onPress={() => void openEdit(c)}
                  />
                ) : null}
              </div>
            </div>
          </Surface>
        ))}
      </div>
      {data && clients.length === 0 ? (
        <EmptyState.Root
          icon="server"
          title={t('dlclients.empty')}
          actions={addButton ?? undefined}
        />
      ) : null}

      <DownloadClientModal />
    </Section.Root>
  );
}

function TestLine({ test }: Readonly<{ test?: TestState }>) {
  const t = useT();
  if (test?.busy) {
    return (
      <span className="text-[12px] font-semibold text-white/45">{t('dlclients.testing')}</span>
    );
  }
  if (test?.error || test?.result?.error) {
    return (
      <span className="min-w-0 truncate text-[12px] font-semibold text-danger-hover">
        {test.error ?? test.result?.error}
      </span>
    );
  }
  if (test?.result?.ok) {
    return <span className="text-[12px] font-semibold text-success">{test.result.version}</span>;
  }
  return <span className="text-[12px] font-medium text-white/30">{t('dlclients.notTested')}</span>;
}
