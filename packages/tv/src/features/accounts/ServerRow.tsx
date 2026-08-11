import type { Translate } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Badge,
  Box,
  Icon,
  type IconName,
  IconWell,
  ListRow,
  listRowVariants,
  Skeleton,
  styles,
  Text,
} from '@kroma/ui/kit';
import type { ServerProbe } from '#tv/app/useServersHealth';
import { ServerStatusPill } from '#tv/features/accounts/ServerStatus';

/**
 * One server in the add-profile list. Everything but the address comes from
 * the server's own `/api/health` answer; until it lands, renders the
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
  address: string;
  fallbackName: string;
  isNew?: boolean;
  probe?: ServerProbe;
  autoFocus?: boolean;
  onPress: () => void;
}>) {
  const t = useT();
  const name = probe?.name || fallbackName;
  const meta = metaOf(probe, t);

  // A <ListRow.Root> with its middle column written out: the arrangement this
  // row needs (a badge beside the title, two sub-lines) is more than
  // `label`/`hint` can say, but the shell, the blur, the lift and the focus ring
  // are the kit's - a row that drew its own arrived in a different colour with a
  // different focus every time either side was touched.
  return (
    <ListRow.Root label={name} onPress={onPress} autoFocus={autoFocus}>
      <ListRow.Leading>
        <IconWell name="server-2" />
      </ListRow.Leading>
      <Box row align="center" gap={9}>
        <ListRow.Label>{name}</ListRow.Label>
        {isNew ? <Badge tone="info">{t('addProfile.new')}</Badge> : null}
      </Box>
      <Text variant="leadTv" lines={1} color="textDim">
        {address}
      </Text>
      {/* Fixed height: the meta line arrives one probe late, and the list must
          not reflow under the focused row when it does. */}
      <Box h={16} justify="center">
        <MetaLine meta={meta} pending={probe === undefined} />
      </Box>
      <ListRow.Trailing>
        <ServerStatusPill probe={probe} />
        <Icon name="chevron-right" size={22} color="textDim" />
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

/** The list's non-server row ("Ajouter manuellement"). */
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
  return (
    <ListRow.Root icon={icon} label={title} hint={sub} autoFocus={autoFocus} onPress={onPress} />
  );
}

/** Placeholder shown while LAN discovery is still looking. Deliberately not
 * focusable, so the remote walks straight past it. */
export function ServerRowSkeleton() {
  return (
    <Box style={[listRowVariants({ size: 'tv' }).root, s.ghost]}>
      <Skeleton w={42} h={42} radius="xl" />
      <Box flex minW={0} gap={8}>
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
      <Text lines={1} style={s.meta} color="text/42">
        {meta}
      </Text>
    );
  }
  return pending ? <Skeleton w={130} h={8} radius="pill" /> : null;
}

function metaOf(probe: ServerProbe | undefined, t: Translate): string | null {
  if (!probe?.online) return null;
  const parts: string[] = [];
  if (probe.version) parts.push(`v${probe.version}`);
  if (probe.items !== undefined) parts.push(t('person.titleCount', { count: probe.items }));
  if (probe.shows) parts.push(t('addProfile.showCount', { count: probe.shows }));
  return parts.length > 0 ? parts.join(' · ') : null;
}

const s = styles({
  meta: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.2 },
  ghost: { opacity: 0.55 },
});
