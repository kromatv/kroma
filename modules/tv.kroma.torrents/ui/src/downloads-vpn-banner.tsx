import { useT } from '@kroma/module-sdk';
import { Box, Callout } from '@kroma/ui/kit';

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
      </Callout.Root>
    </Box>
  );
}
