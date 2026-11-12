import { KromaApiError } from '@kromatv/client';
import { apiErrorText, useT } from '@kromatv/module-sdk';
import { Box, Button, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useVpnApi } from './api';
import { MullvadRefusal, RouterFull } from './schemas';

const REFUSAL_KEY = {
  accountNeeded: 'vpn.mullvadAccountNeeded',
  invalidAccount: 'vpn.mullvadInvalidAccount',
  maxDevices: 'vpn.mullvadMaxDevices',
  noRelay: 'vpn.mullvadNoOtherRelay',
  throttled: 'vpn.mullvadThrottled',
  unavailable: 'vpn.mullvadUnavailable',
} as const;

/** Keep the picked place beside the default tunnel, on the same Mullvad
 *  device, so a network rule can send calls through it. */
export function MullvadRouterButton({
  country,
  city,
  ownedOnly,
  onRouted,
}: Readonly<{
  country: string;
  city: string | null;
  ownedOnly: boolean;
  onRouted: () => void;
}>) {
  const t = useT();
  const vpn = useVpnApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await vpn.mullvadAddToRouter({ country, city, ownedOnly });
      onRouted();
    } catch (cause: unknown) {
      setError(refusalText(cause, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box gap={6}>
      <Row>
        <Button
          variant="glass"
          label={t('vpn.mullvadAddToRouter')}
          onPress={() => void add()}
          loading={busy}
          disabled={country === '' || busy}
        />
      </Row>
      <Text variant="meta" color="textDim">
        {t('vpn.mullvadRouterHint')}
      </Text>
      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
    </Box>
  );
}

function refusalText(cause: unknown, t: ReturnType<typeof useT>): string {
  const body = cause instanceof KromaApiError ? cause.body : null;
  const full = RouterFull.safeParse(body);
  if (full.success) return t('vpn.routerFull', { count: full.data.max });
  const refusal = MullvadRefusal.safeParse(body);
  if (refusal.success) return t(REFUSAL_KEY[refusal.data.code]);
  return apiErrorText(cause, t('vpn.mullvadUnavailable'));
}
