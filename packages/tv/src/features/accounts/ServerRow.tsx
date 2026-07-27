import type { Translate } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Badge,
  Box,
  colors,
  Focusable,
  Icon,
  type IconName,
  IconWell,
  ListRow,
  Skeleton,
  Txt,
} from '@kroma/ui/kit';
import type { ServerProbe } from '#tv/app/useServersHealth';
import { ServerStatusPill } from '#tv/features/accounts/ServerStatus';

/**
 * One server in the add-profile list. Everything but the address comes from the
 * server's own `/api/health` answer (its name, its version, how big its
 * catalogue is, how fast it replied), so the row shows what you are about to
 * connect to instead of a bare IP. Until the first answer lands it renders the
 * saved/host name with a placeholder meta line.
 */
export function ServerRow({
  address,
  fallbackName,
  isNew,
  probe,
  autoFocus,
  onPress,
}: Readonly<{
  /** "host" or "host - port N", the one thing known without a probe. */
  address: string;
  /** Shown until (and if) the server states its own name. */
  fallbackName: string;
  /** Discovered on the LAN but not saved yet. */
  isNew?: boolean;
  probe?: ServerProbe;
  autoFocus?: boolean;
  onPress: () => void;
}>) {
  const t = useT();
  const name = probe?.name || fallbackName;
  const meta = metaOf(probe, t);

  return (
    <Focusable
      onPress={onPress}
      label={name}
      autoFocus={autoFocus}
      focusScale={1.02}
      ring={false}
      style={ROW}
      focusedStyle={FOCUSED}
    >
      <IconWell name="server-2" />
      <Box flex gap={3} style={MIN_0}>
        <Box row align="center" gap={9}>
          <Txt lines={1} style={TITLE}>
            {name}
          </Txt>
          {isNew ? <Badge tone="info">{t('addProfile.new')}</Badge> : null}
        </Box>
        <Txt lines={1} style={SUB} color="textDim">
          {address}
        </Txt>
        {/* Fixed height: the meta line arrives one probe late, and the list must
            not reflow under the focused row when it does. */}
        <Box h={16} justify="center">
          <MetaLine meta={meta} pending={probe === undefined} />
        </Box>
      </Box>
      <ServerStatusPill probe={probe} />
      <Icon name="chevron-right" size={22} color="textDim" />
    </Focusable>
  );
}

/** The list's non-server row ("Ajouter manuellement"): the kit's <ListRow>
 * (icon well + label + hint + chevron), no status (there is nothing to probe
 * yet). ServerRow above stays bespoke: it needs a TWO-line hint (address + the
 * probe's meta line with its no-reflow placeholder), which ListRow's single
 * `hint` cannot express. */
export function ActionRow({
  icon,
  title,
  sub,
  autoFocus,
  onPress,
}: Readonly<{
  icon: IconName;
  title: string;
  sub: string;
  autoFocus?: boolean;
  onPress: () => void;
}>) {
  return <ListRow icon={icon} label={title} hint={sub} autoFocus={autoFocus} onPress={onPress} />;
}

/**
 * A ghost row, for the seconds where LAN discovery is still looking and nothing
 * is known yet: the list shows the shape of what is coming instead of a hole
 * above "Ajouter manuellement". Deliberately NOT focusable, so the remote walks
 * straight past it.
 */
export function ServerRowSkeleton() {
  return (
    <Box style={[ROW, GHOST]}>
      <Skeleton w={42} h={42} radius="xl" />
      <Box flex gap={8} style={MIN_0}>
        <Skeleton w={172} h={13} radius="pill" />
        <Skeleton w={108} h={10} radius="pill" />
      </Box>
      <Skeleton w={58} h={10} radius="pill" />
    </Box>
  );
}

function MetaLine({ meta, pending }: Readonly<{ meta: string | null; pending: boolean }>) {
  if (meta) {
    return (
      <Txt lines={1} style={META} color="rgba(244, 243, 240, 0.42)">
        {meta}
      </Txt>
    );
  }
  return pending ? <Skeleton w={130} h={8} radius="pill" /> : null;
}

/** "v0.9.3 - 342 titres - 18 series" from whatever the health answer carried.
 * Null while the server is silent or answered a body this build can't read. */
function metaOf(probe: ServerProbe | undefined, t: Translate): string | null {
  if (!probe?.online) return null;
  const parts: string[] = [];
  if (probe.version) parts.push(`v${probe.version}`);
  if (probe.items !== undefined) parts.push(t('person.titleCount', { count: probe.items }));
  if (probe.shows) parts.push(t('addProfile.showCount', { count: probe.shows }));
  return parts.length > 0 ? parts.join(' · ') : null;
}

const MIN_0 = { minWidth: 0 };
const TITLE = { fontSize: 19, fontWeight: '700' as const };
const SUB = { fontSize: 14, fontWeight: '500' as const };
const META = { fontSize: 12.5, fontWeight: '600' as const, letterSpacing: 0.2 };

const FOCUSED = { borderColor: colors.accent };

/** The ghost sits a notch behind the real rows: it is not a choice yet. */
const GHOST = { opacity: 0.55 };

const ROW = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 16,
  borderRadius: 15,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.08)',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  paddingHorizontal: 20,
  paddingVertical: 16,
};
