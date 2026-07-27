import { useT } from '@kroma/ui';
import { Box, StatusDot, Txt } from '@kroma/ui/kit';
import type { ServerProbe } from '#tv/app/useServersHealth';

/** The dot plus what the probe measured: the round-trip while the server
 * answers, "Injoignable" when it doesn't, "Vérification…" until the first
 * answer. Round-trip rather than a bare "En ligne" because on a LAN list it is
 * the one number that separates two live servers.
 *
 * The dot itself is the kit's <StatusDot> - what belongs to the app is the
 * sentence next to it, which is the probe read out in the user's language. */
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
