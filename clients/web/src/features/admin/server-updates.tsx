import { apiErrorBody } from '@kromatv/client';
import type { UpdateTarget, UpdateStatus, UpdateOperation } from '@kromatv/client/admin';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Dialog, EmptyState, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { Denied, PageHeader, useCap, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import {
  UpdateHero,
  UpdateProgress,
  ChannelSettings,
  InstallMethod,
} from '#web/features/admin/server-update-cards';

export function ServerUpdatesPage() {
  const allowed = useCap('settings.manage');
  return allowed ? <UpdatesContent /> : <Denied />;
}

function UpdatesContent() {
  const t = useT();
  const { client } = useAuth();
  const { data, failed, reload } = usePoll(
    ['admin', 'updates'],
    () => client.admin.updates(),
    3000,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<UpdateTarget | null>(null);
  const operation = data?.operation;
  const active = updateIsActive(operation);
  const progress = mainProgress(data);

  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (error_) {
      setError(apiErrorBody(error_).error ?? t('admin.updatesActionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.updatesTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.updatesSubtitle')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Button
            variant="outline"
            size="sm"
            icon="refresh"
            label={t('admin.updatesCheck')}
            loading={busy}
            disabled={busy || active}
            onPress={() => void action(() => client.admin.checkUpdates())}
          />
        </PageHeader.Actions>
      </PageHeader.Root>
      {error ? (
        <Box mt={20} accessibilityRole="alert">
          <Text color="danger">{error}</Text>
        </Box>
      ) : null}
      {failed ? (
        <Box mt={20}>
          <Callout.Root tone="accent" icon="wifi-off">
            <Callout.Title>
              {t(active ? 'admin.updatesReconnecting' : 'admin.updatesLoadFailed')}
            </Callout.Title>
            <Callout.Detail>
              {t(active ? 'admin.updatesReconnectingHint' : 'admin.updatesLoadFailedHint')}
            </Callout.Detail>
          </Callout.Root>
        </Box>
      ) : null}
      {data ? (
        <>
          {progress ? (
            <UpdateProgress operation={progress} />
          ) : (
            <UpdateHero
              data={data}
              busy={busy || active}
              onInstall={() => {
                if (data.latest?.build)
                  setConfirm({
                    channel: data.channel,
                    version: data.latest.version,
                    build: data.latest.build,
                  });
              }}
            />
          )}
          <UpdateFailure operation={operation} />
          <ChannelSettings
            data={data}
            disabled={busy || active}
            onChannel={(channel) =>
              void action(async () => {
                await client.admin.updateSettings({ updateChannel: channel });
                await client.admin.checkUpdates();
              })
            }
            onAuto={(auto) => void action(() => client.admin.updateSettings({ autoUpdate: auto }))}
            autoInstallDisabled={busy || !data.installer?.ready}
            onAutoInstall={(enabled) =>
              void action(() => client.admin.updateSettings({ autoInstallUpdates: enabled }))
            }
          />
          <InstallMethod data={data} />
        </>
      ) : null}
      {!data && !failed ? (
        <EmptyState.Root icon="refresh">
          <EmptyState.Title>{t('admin.updatesLoading')}</EmptyState.Title>
        </EmptyState.Root>
      ) : null}
      {confirm ? (
        <Dialog.Root
          open
          title={t('admin.updatesConfirmTitle')}
          width="md"
          onClose={() => !busy && setConfirm(null)}
        >
          <Text>
            {t('admin.updatesConfirmHint', {
              version: confirm.version,
              build: String(confirm.build),
            })}
          </Text>
          <Text variant="meta" color="textDim" mt={12}>
            {t('admin.updatesBackupHint')}
          </Text>
          <Dialog.Actions
            cancelLabel={t('common.cancel')}
            confirmLabel={t('admin.updatesInstall')}
            busy={busy}
            onCancel={() => setConfirm(null)}
            onConfirm={() =>
              void action(async () => {
                await client.admin.installUpdate(confirm);
                setConfirm(null);
              })
            }
          />
        </Dialog.Root>
      ) : null}
    </>
  );
}

function updateIsActive(operation: UpdateOperation | null | undefined) {
  return !!operation && !['complete', 'failed', 'deferred'].includes(operation.phase);
}
function mainProgress(data: UpdateStatus | null) {
  const operation = data?.operation;
  if (!operation) return null;
  if (updateIsActive(operation)) return operation;
  if (operation.phase === 'complete' && !data?.available) return operation;
  return null;
}
function UpdateFailure({ operation }: Readonly<{ operation: UpdateOperation | null | undefined }>) {
  const t = useT();
  if (operation?.phase !== 'failed') return null;
  return (
    <Box mt={16}>
      <Callout.Root tone="accent" icon="alert-triangle">
        <Callout.Title>{t('admin.updateFailed')}</Callout.Title>
        <Callout.Detail>{operation.message ?? t('admin.updatesActionFailed')}</Callout.Detail>
      </Callout.Root>
    </Box>
  );
}
