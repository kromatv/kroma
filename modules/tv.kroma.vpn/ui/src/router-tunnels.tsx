import { apiErrorText, useT } from '@kromatv/module-sdk';
import { Box, ChoiceList, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useVpnApi } from './api';
import type { SavedConfig } from './schemas';

/** The kept configs a network rule can send calls through by name, each on a
 *  tunnel of its own. Shown once one of them is not the default. */
export function RouterTunnels({
  saved,
  slots,
  onChanged,
}: Readonly<{ saved: readonly SavedConfig[]; slots: number; onChanged: () => void }>) {
  const t = useT();
  const vpn = useVpnApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!saved.some((one) => !one.active)) return null;
  const routed = saved.filter((one) => one.routable).map((one) => one.id);
  const full = routed.length >= slots;

  const change = async (next: string[]) => {
    const flipped = saved.find((one) => next.includes(one.id) !== one.routable);
    if (!flipped) return;
    setBusy(true);
    setError(null);
    try {
      await vpn.setRoutable(flipped.id, !flipped.routable);
      onChanged();
    } catch (cause: unknown) {
      setError(apiErrorText(cause, t('requests.actionFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box gap={8} mt={16}>
      <Box gap={2}>
        <Text variant="label">{t('vpn.routerTitle')}</Text>
        <Text variant="meta" color="textDim">
          {t('vpn.routerHint')}
        </Text>
      </Box>
      <ChoiceList.Root
        mode="multiple"
        label={t('vpn.routerTitle')}
        value={routed}
        onValueChange={(next) => void change(next)}
      >
        {saved.map((one) => (
          <ChoiceList.Item key={one.id} value={one.id} disabled={busy || (full && !one.routable)}>
            <ChoiceList.Label>{one.label}</ChoiceList.Label>
            {one.active ? <ChoiceList.Hint>{t('vpn.routerDefault')}</ChoiceList.Hint> : null}
          </ChoiceList.Item>
        ))}
      </ChoiceList.Root>
      {saved.some((one) => one.provider?.kind === 'proton') ? (
        <Text variant="meta" color="textDim">
          {t('vpn.routerProtonLimit')}
        </Text>
      ) : null}
      {full ? (
        <Text variant="meta" color="textDim">
          {t('vpn.routerFull', { count: slots })}
        </Text>
      ) : null}
      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
    </Box>
  );
}
