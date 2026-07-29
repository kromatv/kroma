import { useT } from '@kroma/ui';
import {
  Avatar,
  BackButton,
  Box,
  Focusable,
  FocusRegion,
  gradient,
  Icon,
  Spinner,
  StatusDot,
  shade,
  Txt,
} from '@kroma/ui/kit';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { CastRemotes } from '#tv/features/cast/CastRemotes';
import { type NavItem, NavPill } from '#tv/features/catalog/home/NavPill';
import { KromaMark, useClock } from '#tv/shared/ui';

export type NavKey = 'home' | 'films' | 'series' | 'genres' | 'mylist' | 'search';

// Top scrim so the logo / clock / avatar stay readable over bright hero art (a
// sky, a snowy shot...): the hero veil only darkens left and bottom.
const SCRIM = `linear-gradient(180deg, ${shade(0.72)}, ${shade(0.25)} 45%, transparent)`;

/** The shared 10-foot top bar: brand mark, a centred nav pill (Accueil / Films /
 * Séries / Ma liste / Rechercher), the clock and the account avatar (opens the
 * profile menu). Persistent chrome on the browse screens (Home, Grid, detail,
 * Person) for quick section jumps.
 *
 * `active` is optional: deep screens (detail / person) pass none, so nothing is
 * highlighted. */
export function TvTopNav({ active }: Readonly<{ active?: NavKey }>) {
  const nav = useNav();
  const t = useT();
  const clock = useClock();
  const { user } = useAuth();
  const { client, online } = useConnection();

  // Same glyph per section as the phone app's tab bar (Tabler home / movie /
  // device-tv / category / bookmark / search), so the two clients read alike.
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
      {/* The whole bar is one focus BAND, and that is what makes a centred pill
          reachable at all. A television moves focus in a straight line, so from
          a control at the bottom left there is nothing overhead and Up does
          nothing - but the band spans the full width, so every Up from anywhere
          below lands in it, whatever the screen puts underneath, and it hands
          focus to the chip you used last. One region here replaces a crossing on
          every screen that shows the bar. */}
      <FocusRegion style={BAND}>
        {/* Back (mouse users): shown on any pushed screen, hidden on Home. The
            remote has Back regardless (every screen wires useFocusNav -> onBack);
            this button is the pointer's equivalent of that key. */}
        <Box row align="center" gap={16}>
          {nav.canGoBack ? <BackButton onPress={nav.back} label={t('common.back')} /> : null}
          <KromaMark size={28} />
        </Box>
        <NavPill items={items} active={active} />
        <Box row align="center" gap={18}>
          {/* Only visible while a phone or browser is driving this set, which is
              also the only time it has anything to say. */}
          <CastRemotes />
          <ConnectionStatus online={online} label={t('connection.reconnecting')} />
          <Txt style={CLOCK}>{clock}</Txt>
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
                src={client?.resolveArt(user.avatarUrl)}
              />
            </Focusable>
          ) : null}
        </Box>
      </FocusRegion>
    </Box>
  );
}

/** The band is laid out by its caller, so it has to be told to span the row. */
const BAND = {
  width: '100%',
  alignItems: 'center',
  justifyContent: 'space-between',
} as const;

const CLOCK = {
  fontSize: 17,
  fontWeight: '600' as const,
  fontVariant: ['tabular-nums' as const],
  textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
};

/** Server-reachability indicator for the top bar. Online: the app's own
 * kit <StatusDot>, ringed so it reads over any hero art. Offline: a solid red badge
 * holding a wifi-off glyph, over a spinner that signals the automatic reconnect
 * in progress. Icon-only, no label: the state reads at a glance. */
function ConnectionStatus({ online, label }: Readonly<{ online: boolean; label: string }>) {
  if (online) return <StatusDot online overArt />;
  return (
    <Box w={36} h={36} center accessibilityLabel={label} accessibilityRole="progressbar">
      <Box absolute>
        <Spinner size={34} thickness={2} color="rgba(229, 57, 53, 0.8)" />
      </Box>
      <Box w={28} h={28} center radius="pill" bg="danger" style={OFFLINE_BADGE}>
        <Icon name="wifi-off" size={16} stroke={2.2} color="#FFFFFF" />
      </Box>
    </Box>
  );
}

const OFFLINE_BADGE = { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)' } as const;
