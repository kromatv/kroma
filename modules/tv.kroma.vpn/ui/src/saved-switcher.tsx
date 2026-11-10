import { apiErrorText, useT } from '@kromatv/module-sdk';
import { Box, Select, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useVpnApi } from './api';
import type { SavedConfig } from './schemas';

/** The configs kept on the server, one click from being the tunnel's. Shown
 * once there are two to choose between. */
export function SavedSwitcher({
  saved,
  onSwitched,
}: Readonly<{ saved: readonly SavedConfig[]; onSwitched: () => void }>) {
  const t = useT();
  const vpn = useVpnApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (saved.length < 2) return null;
  const active = saved.find((one) => one.active)?.id ?? '';

  const choose = async (id: string) => {
    if (id === active) return;
    setBusy(true);
    setError(null);
    try {
      await vpn.useSaved(id);
      onSwitched();
    } catch (cause: unknown) {
      setError(apiErrorText(cause, t('requests.actionFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box gap={6} mt={12}>
      <Box maxW={360}>
        <Select.Root
          value={active}
          onValueChange={(id) => void choose(id)}
          label={t('vpn.savedSwitch')}
          placeholder={t('vpn.savedSwitch')}
          disabled={busy}
        >
          <Select.Trigger block />
          {saved.map((one) => (
            <Select.Item key={one.id} value={one.id} label={one.label} />
          ))}
        </Select.Root>
      </Box>
      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
    </Box>
  );
}
