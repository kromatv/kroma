import { useFormat, usePoll, useT } from '@kroma/module-sdk';
import type { VpnBandwidthTotals } from '@kroma/module-vpn/schemas';
import { Box, Callout } from '@kroma/ui/kit';
import { useTorrentsApi } from './api';

const POLL_MS = 60000;

interface VpnState {
  connected: boolean;
  exitIp: string | null;
  paused: boolean;
}

export function DownloadsVpnBanner({ vpn }: Readonly<{ vpn: VpnState }>) {
  const t = useT();
  let message: string;
  if (vpn.connected) message = t('downloads.vpnOk', { ip: vpn.exitIp ?? '?' });
  else if (vpn.paused) message = t('downloads.vpnBlocked');
  else message = t('downloads.vpnDown');
  return (
    <Box mb={16}>
      <Callout.Root
        size="sm"
        tone={vpn.connected ? 'success' : 'accent'}
        icon={vpn.connected ? 'shield-check' : 'shield-x'}
      >
        <Callout.Title>{message}</Callout.Title>
        <RecentTransfer />
      </Callout.Root>
    </Box>
  );
}

function RecentTransfer() {
  const t = useT();
  const fmt = useFormat();
  const torrents = useTorrentsApi();
  const { data } = usePoll(
    ['admin', 'downloads', 'bandwidth'],
    () => torrents.bandwidth('24h'),
    POLL_MS,
  );
  if (!data) return null;
  const line = transferLine(t, fmt, data.totals);
  return line ? <Callout.Detail>{line}</Callout.Detail> : null;
}

function transferLine(
  t: ReturnType<typeof useT>,
  fmt: ReturnType<typeof useFormat>,
  totals: VpnBandwidthTotals,
): string | null {
  const unsealed = totals.unsealedDownBytes + totals.unsealedUpBytes;
  if (unsealed > 0) return t('downloads.vpnUnsealedDay', { total: fmt.bytes(unsealed) });
  const sealed = totals.sealedDownBytes + totals.sealedUpBytes;
  return sealed > 0 ? t('downloads.vpnSealedDay', { total: fmt.bytes(sealed) }) : null;
}
