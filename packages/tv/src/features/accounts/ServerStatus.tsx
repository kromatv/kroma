import { useT } from '@kroma/ui';
import { Box, StatusDot, Txt } from '@kroma/ui/kit';
import type { ServerProbe } from '#tv/app/useServersHealth';

/** The dot plus the round-trip time, rather than a bare "En ligne": on a LAN
 * list it's the one number that separates two live servers. */
export function ServerStatusPill({ probe }: Readonly<{ probe?: ServerProbe }>) {
  const t = useT();
  const online = probe?.online;
  let label = t('addProfile.checking');
  if (online === false) label = t('addProfile.unreachable');
  else if (probe?.latencyMs !== undefined) label = `${probe.latencyMs} ms`;
  else if (online) label = t('addProfile.reachable');

  return (
    <Box row align="center" gap={8} shrink={0}>
      <StatusDot online={online} />
      <Txt style={LABEL} color={online === false ? 'danger' : 'rgba(244, 243, 240, 0.55)'}>
        {label}
      </Txt>
    </Box>
  );
}

const LABEL = { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.26 };
