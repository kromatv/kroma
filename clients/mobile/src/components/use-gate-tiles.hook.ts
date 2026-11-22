import type { KromaClient } from '@kromatv/client';
import type { PublicUser } from '@kromatv/client/accounts';
import type { KidsChoice } from '@kromatv/core';
import type { GateTile } from '#mobile/components/profile-gate.component';
import { keyOf, useDeviceKids } from '#mobile/components/sign-in-hooks';
import { useT } from '#mobile/lib/i18n';
import type { MobileAccount } from '#mobile/lib/storage';

/** What the gate's tiles are built from: the accounts and roster on screen,
 *  whose servers answer, and what each tile does when pressed. */
export interface GateTilesInput {
  accounts: MobileAccount[];
  roster: PublicUser[];
  serverUrl: string | null;
  online: (url: string) => boolean | undefined;
  label: (url: string) => string | null;
  busy: string | null;
  locked: (account: MobileAccount) => boolean;
  clientFor: (url: string) => KromaClient;
  onSaved: (account: MobileAccount) => void;
  onRoster: (profile: PublicUser) => void;
  onKidsOpened: () => void;
  onKidsFailed: () => void;
}

/** The gate's tiles: every remembered account, the Kids profiles a member here
 *  can open (ACCT-126), then the server's other profiles. */
export function useGateTiles(input: GateTilesInput): GateTile[] {
  const t = useT();
  const kids = useDeviceKids(input.accounts);
  const look = lookOf(input, (url) =>
    input.online(url) === false ? t('profiles.serverOffline') : input.label(url),
  );
  const kidsTile = (choice: KidsChoice): GateTile => ({
    key: `kids-${choice.serverUrl}-${choice.profile.id}`,
    name: choice.profile.username,
    ...look(choice.serverUrl, choice.profile.avatarUrl),
    kids: true,
    onPress: () => void kids.open(choice).then(input.onKidsOpened, input.onKidsFailed),
  });
  const savedTile = (account: MobileAccount): GateTile => ({
    key: keyOf(account),
    name: account.user.username,
    ...look(account.serverUrl, account.user.avatarUrl),
    busy: input.busy === keyOf(account),
    locked: input.locked(account),
    kids: kids.isKids(account),
    onPress: () => input.onSaved(account),
  });
  return [
    ...input.accounts.map(savedTile),
    ...kids.offered.map(kidsTile),
    ...input.roster.map((profile) => rosterTile(input, profile)),
  ];
}

function lookOf(input: GateTilesInput, caption: (url: string) => string | null) {
  return (url: string, avatar: string | null | undefined) => ({
    caption: caption(url),
    avatarUri: input.clientFor(url).media.artwork.resolve(avatar),
    offline: input.online(url) === false,
  });
}

function rosterTile(input: GateTilesInput, profile: PublicUser): GateTile {
  const { serverUrl } = input;
  return {
    key: `roster-${profile.id}`,
    name: profile.username,
    avatarUri: serverUrl
      ? input.clientFor(serverUrl).media.artwork.resolve(profile.avatarUrl)
      : null,
    locked: profile.hasPin,
    onPress: () => input.onRoster(profile),
  };
}
