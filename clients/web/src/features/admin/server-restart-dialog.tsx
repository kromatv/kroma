import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Box, Callout, Dialog, Row, Spinner, Text } from '@kromatv/ui/kit';
import { useEffect, useEffectEvent, useState } from 'react';
import { waitForRestart } from '#web/features/admin/wait-for-restart';
import { useAuth } from '#web/shared/lib/auth';

const SLOW_MS = 120_000;

interface Stopped {
  bootId: string | undefined;
}

/** Asks before restarting the server, then waits for it to answer as a new
 *  process and calls `onRestarted`. Nothing closes it while it waits. */
export function ServerRestartDialog({
  onClose,
  onRestarted,
}: Readonly<{ onClose: () => void; onRestarted: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState<Stopped | null>(null);
  const [slow, setSlow] = useState(false);
  const restarted = useEffectEvent(onRestarted);

  useEffect(() => {
    if (!stopped) return;
    const controller = new AbortController();
    const { signal } = controller;
    const readBootId = () => client.media.health({ signal }).then((health) => health.bootId);
    waitForRestart(readBootId, stopped.bootId, { signal }).then(restarted, () => undefined);
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [stopped, client]);

  async function restart() {
    setBusy(true);
    setError(null);
    try {
      const { bootId } = await client.media.health();
      await client.admin.restartServer();
      setStopped({ bootId });
    } catch (error_) {
      setError(apiErrorText(error_, t('admin.serverRestartFailed')));
      setBusy(false);
    }
  }

  if (stopped) {
    return (
      <Dialog.Root open title={t('admin.serverRestartWaiting')} width="md">
        <Row gap={12} py={4}>
          <Spinner size={18} label={t('admin.serverRestartWaiting')} />
          <Text color="textDim">{t('admin.serverRestartWaitingHint')}</Text>
        </Row>
        {slow ? (
          <Box mt={16}>
            <Callout.Root tone="accent" icon="alert-triangle">
              <Callout.Detail>{t('admin.serverRestartSlow')}</Callout.Detail>
            </Callout.Root>
          </Box>
        ) : null}
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root
      open
      title={t('admin.serverRestartConfirmTitle')}
      width="md"
      onClose={() => !busy && onClose()}
    >
      <Text>{t('admin.serverRestartConfirmHint')}</Text>
      {error ? (
        <Box mt={12} accessibilityRole="alert">
          <Text color="danger">{error}</Text>
        </Box>
      ) : null}
      <Dialog.Actions
        cancelLabel={t('common.cancel')}
        confirmLabel={t('admin.serverRestart')}
        busy={busy}
        onCancel={onClose}
        onConfirm={() => void restart()}
      />
    </Dialog.Root>
  );
}
