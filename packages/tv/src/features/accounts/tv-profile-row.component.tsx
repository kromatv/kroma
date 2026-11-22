import { normalizeServerUrl as norm, type StoredSession } from '@kromatv/client/accounts';
import { type KidsChoice, kidsDoor } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { AddTile, Box, FocusRegion, styles, useStyles } from '@kromatv/ui/kit';
import { useMemo } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { useNav } from '#tv/app/router';
import { useServersHealth } from '#tv/app/use-servers-health.hook';
import { artUrl, hostOf } from '#tv/shared/ui';
import { TvProfileTile } from './tv-profile-tile.component';
import { useDeviceKids } from './use-device-kids.hook';
import { useProfileEntry } from './use-profile-entry.hook';

interface Servers {
  online: (url: string | undefined) => boolean | undefined;
  nameOf: (url: string | undefined) => string;
}

function useServers(accounts: readonly StoredSession[]): Servers {
  const { servers, activeServerName } = useConnection();
  const urls = useMemo(
    () => Array.from(new Set(accounts.map((a) => norm(a.serverUrl ?? '')).filter(Boolean))),
    [accounts],
  );
  const health = useServersHealth(urls);
  return {
    online: (url) => health[norm(url ?? '')]?.online,
    nameOf: (url) =>
      servers.find((entry) => entry.url === norm(url ?? ''))?.name ||
      hostOf(norm(url ?? '')) ||
      (activeServerName ?? 'KROMA'),
  };
}

/** The picker's row: the profiles remembered here, the Kids profiles a member
 *  here can open (ACCT-126), and the tiles that add a profile. */
export function TvProfileRow({ onMenu }: Readonly<{ onMenu: (account: StoredSession) => void }>) {
  const s = useStyles(sDefinition);
  const { accounts } = useAuth();
  const servers = useServers(accounts);
  const kids = useDeviceKids(accounts);
  return (
    // No own scroll or clip: the page (AuthScreen) scrolls, so the focus zoom
    // and the amber ring are never cropped. Gutters keep the edge tiles'
    // rings clear.
    <FocusRegion style={s.profileRow}>
      <RememberedTiles servers={servers} isKids={kids.isKids} onMenu={onMenu} />
      {kids.offered.map((choice) => (
        <KidsTile key={keyOf(choice)} choice={choice} servers={servers} onOpen={kids.open} />
      ))}
      <AddTiles accounts={accounts} />
    </FocusRegion>
  );
}

function RememberedTiles({
  servers,
  isKids,
  onMenu,
}: Readonly<{
  servers: Servers;
  isKids: (account: StoredSession) => boolean;
  onMenu: (account: StoredSession) => void;
}>) {
  const { accounts } = useAuth();
  return accounts.map((account, index) => (
    <RememberedTile
      key={`${norm(account.serverUrl)}|${account.user.id}`}
      account={account}
      servers={servers}
      kids={isKids(account)}
      // The screen's entry point: tvOS picks by geometry and the web
      // engine by DOM order, so this isn't left to chance.
      autoFocus={index === 0}
      onMenu={onMenu}
    />
  ));
}

interface RememberedTileProps {
  account: StoredSession;
  servers: Servers;
  kids: boolean;
  autoFocus: boolean;
  onMenu: (account: StoredSession) => void;
}

function RememberedTile({
  account,
  servers,
  kids,
  autoFocus,
  onMenu,
}: Readonly<RememberedTileProps>) {
  const { enter } = useProfileEntry();
  const online = servers.online(account.serverUrl);
  return (
    <TvProfileTile
      name={account.user.username}
      seed={account.user.id}
      src={artUrl(norm(account.serverUrl), account.user.avatarUrl)}
      locked={account.user.hasPin}
      kids={kids}
      online={online}
      serverName={servers.nameOf(account.serverUrl)}
      autoFocus={autoFocus}
      onPress={() => {
        if (online !== false) {
          enter(account);
        }
      }}
      onLongPress={() => onMenu(account)}
    />
  );
}

function KidsTile({
  choice,
  servers,
  onOpen,
}: Readonly<{
  choice: KidsChoice;
  servers: Servers;
  onOpen: (choice: KidsChoice) => Promise<void>;
}>) {
  const online = servers.online(choice.serverUrl);
  return (
    <TvProfileTile
      name={choice.profile.username}
      seed={choice.profile.id}
      src={artUrl(norm(choice.serverUrl), choice.profile.avatarUrl)}
      locked={false}
      kids
      online={online}
      serverName={servers.nameOf(choice.serverUrl)}
      autoFocus={false}
      onPress={() => {
        if (online !== false) {
          void onOpen(choice);
        }
      }}
    />
  );
}

function AddTiles({ accounts }: Readonly<{ accounts: readonly StoredSession[] }>) {
  const t = useT();
  const nav = useNav();
  const { addKids } = useProfileEntry();
  const door = kidsDoor(accounts);
  return (
    <>
      <Box w={150} align="center">
        <AddTile
          label={t('profiles.addProfile')}
          onPress={() => nav.go('addProfile')}
          // Entry point only when there is no profile to land on.
          autoFocus={accounts.length === 0}
        />
      </Box>
      {door ? (
        <Box w={150} align="center">
          <AddTile label={t('admin.addKids')} onPress={() => addKids(door)} />
        </Box>
      ) : null}
    </>
  );
}

function keyOf({ serverUrl, profile }: KidsChoice): string {
  return `kids|${norm(serverUrl)}|${profile.id}`;
}

const sDefinition = styles({
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
