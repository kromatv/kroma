import type { MessageKey, Translate } from '@kromatv/i18n';

const PURPOSE: Record<string, MessageKey> = {
  metadata: 'modulePermissions.purposeMetadata',
  'binary-download': 'modulePermissions.purposeBinaryDownload',
  'model-download': 'modulePermissions.purposeModelDownload',
  tunnel: 'modulePermissions.purposeTunnel',
  peers: 'modulePermissions.purposePeers',
  'peers-announce': 'modulePermissions.purposePeersAnnounce',
  'torrent-file': 'modulePermissions.purposeTorrentFile',
  'seal-check': 'modulePermissions.purposeSealCheck',
  'engine-api': 'modulePermissions.purposeEngineApi',
  indexer: 'modulePermissions.purposeIndexer',
  'indexer-definitions': 'modulePermissions.purposeIndexerDefinitions',
  flaresolverr: 'modulePermissions.purposeFlaresolverr',
  'download-client': 'modulePermissions.purposeDownloadClient',
  torznab: 'modulePermissions.purposeTorznab',
  roku: 'modulePermissions.purposeRoku',
  proxy: 'modulePermissions.purposeProxy',
};

const ACCOUNT: Record<string, MessageKey> = {
  'users.email': 'modulePermissions.fieldEmail',
  'users.username': 'modulePermissions.fieldUsername',
  'users.pin_hash': 'modulePermissions.fieldPin',
  'users.avatar_url': 'modulePermissions.fieldAvatar',
  'users.permissions': 'modulePermissions.fieldRights',
  'users.language': 'modulePermissions.fieldLanguage',
  'users.audio_language': 'modulePermissions.fieldAudioLanguage',
  'users.subtitle_language': 'modulePermissions.fieldSubtitleLanguage',
  'users.created_at': 'modulePermissions.fieldCreatedAt',
  'users.id': 'modulePermissions.fieldId',
  users: 'modulePermissions.fieldEverything',
  play_history: 'modulePermissions.fieldHistory',
  progress: 'modulePermissions.fieldHistory',
  watched: 'modulePermissions.fieldHistory',
  my_list: 'modulePermissions.fieldLists',
  user_taste: 'modulePermissions.fieldTaste',
  sessions: 'modulePermissions.fieldSessions',
  access_tokens: 'modulePermissions.fieldSessions',
  passkeys: 'modulePermissions.fieldSessions',
};

const TABLE: Record<string, MessageKey> = {
  items: 'modulePermissions.tableCatalog',
  shows: 'modulePermissions.tableCatalog',
  files: 'modulePermissions.tableCatalog',
  libraries: 'modulePermissions.tableCatalog',
  metadata_core: 'modulePermissions.tableCatalog',
  season_meta: 'modulePermissions.tableCatalog',
  episode_guide: 'modulePermissions.tableCatalog',
  acq_file_tmdb: 'modulePermissions.tableCatalog',
  acq_tmdb: 'modulePermissions.tableCatalog',
  requests: 'modulePermissions.tableRequests',
  wanted: 'modulePermissions.tableFollowed',
  wanted_titled: 'modulePermissions.tableFollowed',
  monitored: 'modulePermissions.tableFollowed',
  downloads: 'modulePermissions.tableDownloads',
};

const NAMING = 'modulePermissions.settingNaming';
const ENGINE = 'modulePermissions.settingEngine';
const VPN = 'modulePermissions.settingVpn';
const REMOTE = 'modulePermissions.settingRemote';
const INDEXERS = 'modulePermissions.settingIndexers';
const ACQUISITION = 'modulePermissions.settingAcquisition';

const SETTING: Record<string, MessageKey> = {
  namingCase: NAMING,
  namingEpisodeFile: NAMING,
  namingMovieFile: NAMING,
  namingMovieFolder: NAMING,
  namingSeasonFolder: NAMING,
  namingSeriesFolder: NAMING,
  rqbitDownKbps: ENGINE,
  rqbitUpKbps: ENGINE,
  rqbitPort: ENGINE,
  torrentMaxActive: ENGINE,
  vpnCheckUrl: VPN,
  vpnKillSwitch: VPN,
  vpnLocalPort: VPN,
  vpnWgConfig: 'modulePermissions.settingWireguard',
  remoteAccess: REMOTE,
  remoteUrl: REMOTE,
  remoteAccessToken: 'modulePermissions.settingRemoteToken',
  localDiscovery: 'modulePermissions.settingDiscovery',
  acqFlaresolverrUrl: INDEXERS,
  acqIndexersUseVpn: INDEXERS,
};

/** One named thing a module reaches, and whether the core has a word for it.
 *  An unnamed one keeps its raw name, which a summary never shows. */
export interface Word {
  text: string;
  named: boolean;
}

function wordFor(raw: string, key: MessageKey | undefined, t: Translate): Word {
  return key ? { text: t(key), named: true } : { text: raw, named: false };
}

/** The phrase saying why a connection is made; a purpose the core has no words
 *  for is quoted as the module wrote it. */
export function purposeWord(purpose: string, t: Translate): string {
  const key = PURPOSE[purpose];
  return key ? t(key) : t('modulePermissions.purposeOther', { purpose });
}

const ACCOUNT_ORDER = Object.keys(ACCOUNT);

/** Orders `storage.core` entries the way a reader weighs them: an e-mail address
 *  before a language, and what the core has no word for last. */
export function byAccountWeight(a: string, b: string): number {
  const rank = (entry: string) => {
    const at = ACCOUNT_ORDER.indexOf(entry);
    return at === -1 ? ACCOUNT_ORDER.length : at;
  };
  return rank(a) - rank(b);
}

/** A `storage.core` entry as data about people, or null for one that is not. */
export function accountWord(entry: string, t: Translate): Word | null {
  if (entry in ACCOUNT) return wordFor(entry, ACCOUNT[entry], t);
  return entry.startsWith('users.') ? wordFor(entry, undefined, t) : null;
}

export function tableWord(entry: string, t: Translate): Word {
  const table = entry.split('.')[0] ?? entry;
  return wordFor(table, TABLE[table], t);
}

export function settingWord(key: string, t: Translate): Word {
  if (key in SETTING) return wordFor(key, SETTING[key], t);
  return key.startsWith('acq') ? wordFor(key, ACQUISITION, t) : wordFor(key, undefined, t);
}

/** How a module may touch one thing: read it, change it, or both. */
export function accessWord(reads: boolean, writes: boolean, t: Translate): string {
  if (!writes) return t('modulePermissions.readOnly');
  return t(reads ? 'modulePermissions.readWrite' : 'modulePermissions.writeOnly');
}

/** `a, b and c` in the reader's language. Past `shown` items the rest is
 *  counted, together with `unlisted` items that were never in the list. */
export function listOf(
  items: readonly string[],
  t: Translate,
  shown = items.length,
  unlisted = 0,
): string {
  const head = items.slice(0, shown);
  const rest = items.length - head.length + unlisted;
  const parts = rest > 0 ? [...head, t('modulePermissions.others', { count: rest })] : head;
  const last = parts.at(-1);
  if (parts.length < 2 || last === undefined) return parts.join('');
  return t('modulePermissions.list', { head: parts.slice(0, -1).join(', '), last });
}

/** The phrase with its first letter raised, for a phrase that opens a line. */
export const opening = (phrase: string): string =>
  phrase.charAt(0).toLocaleUpperCase() + phrase.slice(1);
