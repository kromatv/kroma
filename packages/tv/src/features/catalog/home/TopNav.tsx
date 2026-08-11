import { useT } from '@kroma/ui';
import {
  Avatar,
  BackButton,
  Box,
  Focusable,
  FocusRegion,
  FocusSlot,
  gradient,
  Icon,
  Spinner,
  StatusDot,
  shade,
  styles,
  Text,
} from '@kroma/ui/kit';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { CastRemotes } from '#tv/features/cast/CastRemotes';
import { type NavItem, NavPill } from '#tv/features/catalog/home/NavPill';
import { KromaMark, useClock } from '#tv/shared/ui';

export type NavKey = 'home' | 'films' | 'series' | 'genres' | 'mylist' | 'search';

// Keeps the bar readable over bright hero art; the hero veil only darkens left
// and bottom.
const SCRIM = `linear-gradient(180deg, ${shade(0.72)}, ${shade(0.25)} 45%, transparent)`;

/** The shared 10-foot top bar. Omitting `active` highlights nothing, which is
 * what deep screens (detail / person) want. */
export function TvTopNav({ active }: Readonly<{ active?: NavKey }>) {
  const nav = useNav();
  const t = useT();
  const clock = useClock();
  const { user } = useAuth();
  const { client, online } = useConnection();

  const items: NavItem[] = [
    { key: 'home', icon: 'home', label: t('nav.home'), onPress: () => nav.home() },
    {
      key: 'films',
      icon: 'movie',
      label: t('nav.films'),
      onPress: () => nav.reset('grid', { kind: 'films' }),
    },
    {
      key: 'series',
      icon: 'device-tv',
      label: t('nav.series'),
      onPress: () => nav.reset('grid', { kind: 'series' }),
    },
    { key: 'genres', icon: 'category', label: t('nav.genres'), onPress: () => nav.reset('genres') },
    {
      key: 'mylist',
      icon: 'bookmark',
      label: t('nav.myList'),
      onPress: () => nav.reset('grid', { kind: 'mylist' }),
    },
    { key: 'search', icon: 'search', label: t('nav.search'), onPress: () => nav.reset('search') },
  ];

  return (
    <Box absolute left={0} right={0} top={0} z={10} px={64} py={32}>
      <Box
        absolute
        left={0}
        right={0}
        top={0}
        h={144}
        pointerEvents="none"
        style={gradient(SCRIM)}
      />
      {/* One full-width focus band: a TV moves focus in a straight line, so a
          band is what makes the centred pill reachable by Up from anywhere. */}
      <FocusRegion style={s.band}>
        {/* A <FocusSlot>, because this bar OUTLIVES the screens it sits on: the
            back button appears the moment a screen has somewhere to go back to,
            and a node that registers after the bar is built lands at the END of
            the band's order however far left it is drawn - the button in the
            top-left corner was reached by pressing Right past the pill and the
            avatar. The slot is mounted from the start and holds first place. */}
        <FocusSlot>
          <Box row align="center" gap={16}>
            {nav.canGoBack ? <BackButton onPress={nav.back} label={t('common.back')} /> : null}
            <KromaMark size={28} />
          </Box>
        </FocusSlot>
        <NavPill items={items} active={active} />
        <Box row align="center" gap={18}>
          {/* Renders only while a phone or browser is driving this set. */}
          <CastRemotes />
          <ConnectionStatus online={online} label={t('connection.reconnecting')} />
          <Text variant="labelTv" style={s.clock}>
            {clock}
          </Text>
          {user ? (
            <Focusable
              onPress={() => nav.go('profileMenu')}
              label={user.username}
              focusScale={1.08}
              style={{ borderRadius: 11 }}
            >
              <Avatar
                name={user.username}
                seed={user.id}
                size={44}
                roundness={0.25}
                src={client?.resolveArt(user.avatarUrl, 44)}
              />
            </Focusable>
          ) : null}
        </Box>
      </FocusRegion>
    </Box>
  );
}

function ConnectionStatus({ online, label }: Readonly<{ online: boolean; label: string }>) {
  if (online) return <StatusDot online overArt />;
  return (
    <Box w={36} h={36} center accessibilityLabel={label} accessibilityRole="progressbar">
      <Box absolute>
        <Spinner size={34} thickness={2} color="danger/80" />
      </Box>
      <Box w={28} h={28} center radius="pill" bg="danger" style={s.offlineBadge}>
        <Icon name="wifi-off" size={16} stroke={2.2} color="white" />
      </Box>
    </Box>
  );
}

const s = styles({
  band: { w: '100%', align: 'center', justify: 'space-between' },
  clock: {
    fontVariant: ['tabular-nums'],
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
  },
  offlineBadge: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)' },
});
