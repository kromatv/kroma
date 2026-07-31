import { normalizeServerUrl as norm, type StoredSession } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  Chip,
  Focusable,
  FocusRegion,
  Hint,
  Icon,
  type IconProps,
  StatusDot,
  type StyleDecl,
  styles,
  svFor,
  Txt,
  useFocusNav,
} from '@kroma/ui/kit';
import { useMemo } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { useServersHealth } from '#tv/app/useServersHealth';
import { AuthScreen, artUrl, hostOf, KromaMark } from '#tv/shared/ui';

interface Tile {
  key: string;
  account: StoredSession;
  serverName: string;
}

/**
 * Profile picker, the signed-out home. Shows only the profiles paired on this
 * device; a PIN-protected profile routes to the PIN screen, the rest sign in
 * instantly.
 */
export function TvProfiles() {
  const nav = useNav();
  const t = useT();
  const { servers, activeServerName } = useConnection();
  const { accounts, activate, isUnlocked } = useAuth();

  const tiles = useMemo<Tile[]>(() => {
    const nameFor = (url: string) =>
      servers.find((entry) => entry.url === norm(url))?.name ||
      hostOf(norm(url)) ||
      (activeServerName ?? 'KROMA');
    return accounts.map((a) => ({
      key: `${norm(a.serverUrl)}|${a.user.id}`,
      account: a,
      serverName: nameFor(a.serverUrl ?? ''),
    }));
  }, [accounts, servers, activeServerName]);

  const serverUrls = useMemo(
    () => Array.from(new Set(accounts.map((a) => norm(a.serverUrl ?? '')).filter(Boolean))),
    [accounts],
  );
  const health = useServersHealth(serverUrls);

  useFocusNav({ onBack: nav.back, resetKey: tiles.length });

  const onSelect = (a: StoredSession, offline: boolean) => {
    // Signing in would only fail against a server that isn't answering.
    if (offline) return;
    const locked = a.user.hasPin && !isUnlocked(a);
    if (locked) nav.go('pin', { intent: 'verify', account: a });
    else activate(a);
  };

  return (
    <AuthScreen>
      <Box mb={28}>
        <KromaMark size={34} />
      </Box>
      <Txt
        variant="hero"
        style={{ fontSize: 50, lineHeight: 50, fontWeight: '600', marginBottom: 12 }}
      >
        {t('auth.whoWatching')}
      </Txt>
      <Txt style={{ fontSize: 17, fontWeight: '500', marginBottom: 44 }} color="textDim">
        {t('profiles.subtitle')}
      </Txt>

      {/* No own scroll or clip: the page (AuthScreen) scrolls, so the focus zoom
          and the amber ring are never cropped. Gutters keep the edge tiles'
          rings clear. */}
      <FocusRegion style={s.profileRow}>
        {tiles.map(({ key, account, serverName }, index) => {
          const up = health[norm(account.serverUrl ?? '')]?.online;
          const offline = up === false;
          return (
            <Box key={key} w={150} align="center" gap={12}>
              <Focusable
                onPress={() => onSelect(account, offline)}
                label={account.user.username}
                // The screen's entry point: tvOS picks by geometry and the web
                // engine by DOM order, so this isn't left to chance.
                autoFocus={index === 0}
                focusScale={1.07}
                style={{ borderRadius: 24 }}
              >
                <Box opacity={offline ? 0.4 : 1}>
                  <Avatar
                    name={account.user.username}
                    seed={account.user.id}
                    size={146}
                    src={artUrl(norm(account.serverUrl), account.user.avatarUrl)}
                    locked={account.user.hasPin}
                  />
                </Box>
              </Focusable>
              <Box align="center" gap={5}>
                <Txt style={{ fontSize: 18, fontWeight: '500' }} color="rgba(244, 243, 240, 0.82)">
                  {account.user.username}
                </Txt>
                <Box row align="center" gap={6}>
                  <StatusDot online={up} />
                  <Txt
                    style={{ fontSize: 12, fontWeight: '600' }}
                    color={offline ? 'danger' : 'rgba(244, 243, 240, 0.42)'}
                  >
                    {offline ? t('connection.offline') : serverName}
                  </Txt>
                </Box>
              </Box>
            </Box>
          );
        })}

        <Box w={150} align="center" gap={12}>
          <Focusable
            onPress={() => nav.go('addProfile')}
            label={t('profiles.addProfile')}
            // Entry point only when there is no profile to land on.
            autoFocus={tiles.length === 0}
            focusScale={1.07}
            ring={false}
            sv={addTile}
          >
            {({ slots }) => <Icon name="plus" {...slots.glyph} />}
          </Focusable>
          <Txt style={{ fontSize: 18, fontWeight: '500' }} color="rgba(244, 243, 240, 0.5)">
            {t('profiles.addProfile')}
          </Txt>
        </Box>
      </FocusRegion>

      {/* Device settings (language, keyboard, desktop extras) must stay reachable
          while signed out: there is no profile menu yet. */}
      <Box mt={40}>
        <Chip
          variant="subtle"
          icon="settings"
          focusScale={1.04}
          label={t('profiles.deviceSettings')}
          onPress={() => nav.go('deviceSettings')}
          style={{ paddingHorizontal: 18, paddingVertical: 10, borderWidth: 1 }}
        />
      </Box>

      <Hint
        text={t('profiles.navHint')}
        size={14}
        gap={4}
        mt={24}
        color="rgba(244, 243, 240, 0.4)"
        textStyle={s.navHint}
      />
    </AuthScreen>
  );
}

const addTile = svFor<{ root: StyleDecl; glyph: Pick<IconProps, 'color' | 'size' | 'stroke'> }>()({
  slots: {
    root: {
      w: 146,
      h: 146,
      center: true,
      radius: 24,
      borderStyle: 'dashed',
      border: 'white/18',
      borderWidth: 2,
      _focus: { borderColor: 'accent' },
    },
    glyph: { color: 'white/35', size: 46, stroke: 1.6, _focus: { color: 'accent' } },
  },
});

const s = styles({
  // Type only. Anything that lays the ROW out (the margin above it) goes on the
  // <Hint> itself: `textStyle` reaches the words alone, so a margin here drops
  // the words below the chevrons instead of moving the whole line.
  navHint: { fontWeight: '600', letterSpacing: 0.42 },
  profileRow: {
    row: true,
    wrap: true,
    justify: 'center',
    align: 'flex-start',
    gap: 28,
    w: '100%',
    maxW: 1100,
    px: 24,
    py: 16,
  },
});
