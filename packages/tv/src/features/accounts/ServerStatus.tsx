import { useT } from '@kroma/ui';
import { Box, StatusDot, styles, Text } from '@kroma/ui/kit';
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
      <Text style={s.label} color={online === false ? 'danger' : 'text/55'}>
        {label}
      </Text>
    </Box>
  );
}

const s = styles({
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.26 },
});
