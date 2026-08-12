import * as accounts from './client/accounts';
import * as admin from './client/admin';
import * as artwork from './client/artwork';
import {
  KromaApiError,
  type KromaClientOptions,
  preconnect,
  type RequestContext,
  requestBlob,
  requestJson,
  withUserAgent,
} from './client/base';
import * as cast from './client/cast';
import type { DiscoverType } from './client/discovery';
import * as discovery from './client/discovery';
import type { HandoffAnnounce, HandoffEvidence } from './client/handoff';
import * as handoff from './client/handoff';
import * as library from './client/library';
import * as media from './client/media';
import { type ModuleApi, moduleApi } from './client/module-api';
import * as moduleRegistry from './client/modules';
import * as notifications from './client/notifications';
import * as passkeysClient from './client/passkeys';
import * as playback from './client/playback';
import * as quickConnect from './client/quick-connect';
import type { RematchKind } from './client/rematch';
import * as rematch from './client/rematch';
import type { ReportQuery } from './client/reports';
import * as reports from './client/reports';
import * as requests from './client/requests';
import * as subtitlesClient from './client/subtitles';
import type {
  Activity,
  AdminLibrary,
  AdminOverview,
  AdminUsers,
  AuthConfig,
  AuthResult,
  CalendarEntry,
  CastAnnounceBody,
  CastAnnounceReply,
  CastCommand,
  CastReceiver,
  ContinueItem,
  CreateReportBody,
  CreateRequestBody,
  DiscoverDetail,
  DiscoverResponse,
  ElementProcessing,
  GrabBody,
  HandoffBeacon,
  HandoffDevice,
  Health,
  HistoryStats,
  InteractiveSearchView,
  Invite,
  InviteCreated,
  JobDetail,
  JobLog,
  JobsView,
  Notification as KromaNotification,
  Library,
  LlmAdminConfig,
  LogsView,
  MatchCandidates,
  MediaItem,
  MediaRequest,
  Metadata,
  MetricsSnapshot,
  ModuleInfo,
  NotificationImages,
  NotificationPrefs,
  NotificationsView,
  PairingStatus,
  PasskeyInfo,
  Permission,
  PersonDetailResponse,
  PersonResponse,
  PipelineElements,
  PipelineTaskView,
  PipelineView,
  PlaybackPing,
  PlaybackSession,
  ProgressEntry,
  PublicUser,
  QuickConnectInit,
  Report,
  ReportsView,
  RequestsView,
  SearchResponse,
  Section,
  SectionItem,
  ServerInfo,
  SessionInfo,
  SettingsView,
  Show,
  ShowDetail,
  SplashEntry,
  StorageInfo,
  SubscribeBody,
  TopUser,
  UpNext,
  User,
} from './types';

export type { AccountPatch } from './client/accounts';
export type { AdminFsEntry, AdminFsList } from './client/admin';
export { artworkScaleValue, artworkWidth, setArtworkScale } from './client/artwork';
export type { KromaClientOptions } from './client/base';
export { apiErrorText, KromaApiError } from './client/base';
export type { DiscoverType } from './client/discovery';
export type { HandoffAnnounce, HandoffEvidence } from './client/handoff';
export type { HlsAudioFilter, StoryboardManifest } from './client/media';
export type { ModuleApi } from './client/module-api';
export type { WebAuthnCredential, WebAuthnOptions } from './client/passkeys';
export type { ReportQuery } from './client/reports';
export type {
  DownloadedSub,
  GenerateReq,
  GenMode,
  GenQuality,
  SubCapabilities,
  SubtitleGeneration,
} from './client/subtitles';
export { GEN_LANGS, GEN_QUALITIES } from './client/subtitles';

// Endpoints a 401 must not trigger a silent refresh for: the token-exchange
// endpoint (would recurse) and pre-auth handshake endpoints (no session bearer).
const NO_REFRESH = new Set([
  '/auth/token',
  '/auth/login',
  '/auth/register',
  '/auth/config',
  '/auth/relock',
  '/auth/quickconnect/initiate',
  '/auth/quickconnect/poll',
  '/handoff/announce',
  '/handoff/leave',
  '/handoff/poll',
]);

/** Thin typed client over the KROMA server REST API, shared by every client shell.
 * Each method delegates to a per-domain implementation in `./client/*`, wired
 * through a shared {@link RequestContext}. */
export class KromaClient {
  readonly baseUrl: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private authToken?: string;
  private locale?: string;
  private refreshHandler?: () => Promise<string | undefined>;
  private readonly ctx: RequestContext;

  constructor(options: KromaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/(^|[^/])\/+$/, '$1');
    const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    // Wrapped once so every route carries the device's name, including calls that bypass json/blob.
    this.fetchFn = options.userAgent ? withUserAgent(fetchFn, options.userAgent) : fetchFn;
    this.authToken = options.authToken;
    this.locale = options.locale;
    this.ctx = {
      baseUrl: this.baseUrl,
      fetchFn: this.fetchFn,
      json: this.json.bind(this),
      blob: this.blob.bind(this),
    };
    preconnect(this.baseUrl);
  }

  setAuthToken(token?: string): void {
    this.authToken = token;
  }

  /** When set, a 401 on a non-auth endpoint triggers one refresh + retry before the error surfaces. */
  setRefreshHandler(fn?: () => Promise<string | undefined>): void {
    this.refreshHandler = fn;
  }

  /** Sent as `Accept-Language`; the server localises admin labels and error messages to match. */
  setLocale(locale?: string): void {
    this.locale = locale;
  }

  /** Whether a bearer token is currently set (does not validate it). */
  get hasAuth(): boolean {
    return Boolean(this.authToken);
  }

  /** The admin API of one module, addressed by its id. A module's routes are
   *  its own: they live under `/api/admin/m/<id>`, so they are not part of this
   *  facade and cannot collide with a core route. */
  module(id: string): ModuleApi {
    return moduleApi(this.ctx, id);
  }

  /** For the one caller that cannot send a header: the event socket, which carries it as a subprotocol. */
  get sessionToken(): string | undefined {
    return this.authToken;
  }

  /** For requests that bypass `json`/`blob` because the platform owns the socket
   * (the native downloader behind {@link downloadUrl}); media-element URLs need
   * nothing, since those routes are public because a `<video>` can't send a header. */
  authHeaders(): Record<string, string> {
    return this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
  }

  private async json<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
    try {
      return await requestJson<T>(
        this.fetchFn,
        this.baseUrl,
        this.authToken,
        this.locale,
        path,
        init,
      );
    } catch (e) {
      // A 401 on an authed endpoint refreshes once from the access token and retries.
      if (
        !retried &&
        e instanceof KromaApiError &&
        e.status === 401 &&
        this.refreshHandler &&
        !NO_REFRESH.has(path.split('?')[0] as string)
      ) {
        const token = await this.refreshHandler();
        if (token) {
          this.authToken = token;
          return this.json<T>(path, init, true);
        }
      }
      throw e;
    }
  }

  private blob(path: string, init?: RequestInit): Promise<Blob> {
    return requestBlob(this.fetchFn, this.baseUrl, this.authToken, this.locale, path, init);
  }

  health(init?: RequestInit): Promise<Health> {
    return media.health(this.ctx, init);
  }

  /** Anonymous sign-in splash art (`GET /api/splash`), usable before login. */
  splash(): Promise<SplashEntry[]> {
    return media.splash(this.ctx);
  }
  /** Modules on this server with their enabled flag + capabilities; drives the admin's data-driven ADD flows. */
  modules(): Promise<ModuleInfo[]> {
    return moduleRegistry.listModules(this.ctx);
  }
  libraries(): Promise<Library[]> {
    return media.libraries(this.ctx);
  }
  items(libraryId?: string): Promise<MediaItem[]> {
    return media.items(this.ctx, libraryId);
  }
  movies(libraryId?: string): Promise<MediaItem[]> {
    return media.movies(this.ctx, libraryId);
  }
  shows(libraryId?: string): Promise<Show[]> {
    return media.shows(this.ctx, libraryId);
  }
  show(id: string): Promise<ShowDetail> {
    return media.show(this.ctx, id);
  }
  item(id: string): Promise<MediaItem> {
    return media.item(this.ctx, id);
  }
  similar(id: string): Promise<MediaItem[]> {
    return media.similar(this.ctx, id);
  }
  themed(query: string): Promise<MediaItem[]> {
    return media.themed(this.ctx, query);
  }
  home(): Promise<Section[]> {
    return media.home(this.ctx);
  }
  /** Today's "En vedette" hero pick; `null` only on an empty catalogue. */
  featured(): Promise<SectionItem | null> {
    return media.featured(this.ctx);
  }
  /** AI suggestions for a title's detail page; `null` while generating (poll). */
  aiSuggest(id: string): Promise<Section | null> {
    return media.aiSuggest(this.ctx, id);
  }
  search(query: string, opts?: { libraryId?: string; limit?: number }): Promise<SearchResponse> {
    return media.search(this.ctx, query, opts);
  }
  /** Every movie + show one person (cast or crew) is credited in. */
  personCredits(name: string, opts?: { libraryId?: string }): Promise<PersonResponse> {
    return media.personCredits(this.ctx, name, opts);
  }
  personDetails(name: string): Promise<PersonDetailResponse> {
    return media.personDetails(this.ctx, name);
  }
  scan(): Promise<{ runId: string }> {
    return media.scan(this.ctx);
  }
  status(): Promise<Activity> {
    return media.status(this.ctx);
  }
  logsUrl(tail = 200): string {
    return media.logsUrl(this.ctx, tail);
  }
  logs(tail = 200): Promise<string> {
    return media.logs(this.ctx, tail);
  }
  streamUrl(id: string): string {
    return media.streamUrl(this.ctx, id);
  }
  downloadUrl(id: string, copyCodecs?: string[], videoCodecs?: string[]): string {
    return media.downloadUrl(this.ctx, id, copyCodecs, videoCodecs);
  }
  hlsMasterUrl(
    id: string,
    aac = false,
    startSec = 0,
    audio = 0,
    filter?: media.HlsAudioFilter,
  ): string {
    return media.hlsMasterUrl(this.ctx, id, aac, startSec, audio, filter);
  }
  posterUrl(id: string): string {
    return artwork.posterUrl(this.ctx, id);
  }
  /** Real poster bytes (cached TMDB art) for the OS "Now Playing" artwork; prefers
   * a raster over the generated SVG placeholder, which NSImage can't render. */
  posterBlob(item: Pick<MediaItem, 'id' | 'metadata'>): Promise<Blob> {
    const raw = item.metadata?.posterUrl;
    // Absolute (TMDB) fallback: fetch directly, no KROMA auth needed.
    if (raw && /^https?:\/\//.test(raw)) {
      return this.fetchFn(raw).then((r) => {
        if (!r.ok) throw new Error(`poster ${r.status}`);
        return r.blob();
      });
    }
    // Cached art paths are stored WITH the `/api` prefix (the resolveArt convention), but
    // `blob()` re-adds `/api`, so strip one. Fall back to the generated poster endpoint.
    const path = raw ? raw.replace(/^\/api\b/, '') : `/items/${encodeURIComponent(item.id)}/poster`;
    return this.blob(path);
  }
  showPosterUrl(id: string): string {
    return artwork.showPosterUrl(this.ctx, id);
  }
  resolveArt(url?: string | null, width?: number): string | null {
    return artwork.resolveArt(this.ctx, url, width);
  }
  posterFor(item: { id: string; metadata?: Metadata | null }, width?: number): string {
    return artwork.posterFor(this.ctx, item, width);
  }
  showPosterFor(show: Pick<Show, 'id' | 'metadata'>, width?: number): string {
    return artwork.showPosterFor(this.ctx, show, width);
  }
  backdropFor(x: { metadata?: Metadata | null }, width?: number): string | null {
    return artwork.backdropFor(this.ctx, x, width);
  }
  themeFor(x: { metadata?: Metadata | null }): string | null {
    return artwork.themeFor(this.ctx, x);
  }
  subtitleUrl(id: string, index: number): string {
    return media.subtitleUrl(this.ctx, id, index);
  }
  /** Storyboard manifest endpoint URL (scrub-bar hover-preview sheet). */
  storyboardUrl(id: string): string {
    return media.storyboardUrl(this.ctx, id);
  }
  /** Fetch the storyboard manifest (`'pending'` while generating, `null` if none). */
  storyboard(id: string): Promise<media.StoryboardManifest | 'pending' | null> {
    return media.storyboard(this.ctx, id);
  }
  downloadedSubtitles(id: string): Promise<subtitlesClient.DownloadedSub[]> {
    return subtitlesClient.downloadedSubtitles(this.ctx, id);
  }
  subtitleCapabilities(id: string): Promise<subtitlesClient.SubCapabilities> {
    return subtitlesClient.subtitleCapabilities(this.ctx, id);
  }
  /** Start a Whisper transcription / LLM translation; returns a `genId` to poll. */
  generateSubtitle(id: string, req: subtitlesClient.GenerateReq): Promise<{ genId: string }> {
    return subtitlesClient.generateSubtitle(this.ctx, id, req);
  }
  /** Live + recently-finished generations for an item. */
  subtitleGenerations(id: string): Promise<subtitlesClient.SubtitleGeneration[]> {
    return subtitlesClient.subtitleGenerations(this.ctx, id);
  }
  cancelGeneration(id: string, genId: string): Promise<void> {
    return subtitlesClient.cancelGeneration(this.ctx, id, genId);
  }
  deleteSubtitle(id: string, dlId: string): Promise<void> {
    return subtitlesClient.deleteSubtitle(this.ctx, id, dlId);
  }

  register(
    email: string,
    username: string,
    password: string,
    inviteToken?: string,
  ): Promise<AuthResult> {
    return accounts.register(this.ctx, email, username, password, inviteToken);
  }
  createInvite(opts?: {
    permissions?: Permission[];
    expiresInDays?: number;
  }): Promise<InviteCreated> {
    return accounts.createInvite(this.ctx, opts);
  }
  invites(): Promise<Invite[]> {
    return accounts.invites(this.ctx);
  }
  checkInvite(token: string): Promise<{ valid: boolean; expiresAt?: number }> {
    return accounts.checkInvite(this.ctx, token);
  }
  revokeInvite(token: string): Promise<void> {
    return accounts.revokeInvite(this.ctx, token);
  }
  login(identifier: string, password: string): Promise<AuthResult> {
    return accounts.login(this.ctx, identifier, password);
  }
  exchangeToken(accessToken: string, pin?: string): Promise<{ token: string; user: User }> {
    return accounts.exchangeToken(this.ctx, accessToken, pin);
  }
  relock(accessToken: string): Promise<void> {
    return accounts.relock(this.ctx, accessToken);
  }
  logout(accessToken?: string): Promise<void> {
    return accounts.logout(this.ctx, accessToken);
  }
  me(): Promise<{ user: User }> {
    return accounts.me(this.ctx);
  }
  updateLanguage(language: string | null): Promise<{ user: User }> {
    return accounts.updateLanguage(this.ctx, language);
  }
  updateAccount(patch: accounts.AccountPatch): Promise<{ user: User }> {
    return accounts.updateAccount(this.ctx, patch);
  }
  changePassword(current: string, next: string): Promise<void> {
    return accounts.changePassword(this.ctx, current, next);
  }
  listSessions(): Promise<SessionInfo[]> {
    return accounts.sessions(this.ctx);
  }
  revokeSession(id: string): Promise<void> {
    return accounts.revokeSession(this.ctx, id);
  }
  passkeyRegisterStart(): Promise<{ ceremonyId: string; options: passkeysClient.WebAuthnOptions }> {
    return passkeysClient.passkeyRegisterStart(this.ctx);
  }
  passkeyRegisterFinish(body: {
    ceremonyId: string;
    name: string;
    credential: passkeysClient.WebAuthnCredential;
  }): Promise<PasskeyInfo> {
    return passkeysClient.passkeyRegisterFinish(this.ctx, body);
  }
  listPasskeys(): Promise<PasskeyInfo[]> {
    return passkeysClient.passkeys(this.ctx);
  }
  deletePasskey(id: string): Promise<void> {
    return passkeysClient.deletePasskey(this.ctx, id);
  }
  passkeyAuthStart(): Promise<{ ceremonyId: string; options: passkeysClient.WebAuthnOptions }> {
    return passkeysClient.passkeyAuthStart(this.ctx);
  }
  passkeyAuthFinish(body: {
    ceremonyId: string;
    credential: passkeysClient.WebAuthnCredential;
  }): Promise<AuthResult> {
    return passkeysClient.passkeyAuthFinish(this.ctx, body);
  }
  users(): Promise<PublicUser[]> {
    return accounts.users(this.ctx);
  }
  authConfig(): Promise<AuthConfig> {
    return accounts.authConfig(this.ctx);
  }
  pinVerify(pin: string): Promise<void> {
    return accounts.pinVerify(this.ctx, pin);
  }
  setPin(pin: string, current?: string): Promise<{ user: User }> {
    return accounts.setPin(this.ctx, pin, current);
  }
  clearPin(current: string): Promise<{ user: User }> {
    return accounts.clearPin(this.ctx, current);
  }
  uploadAvatar(file: Blob): Promise<{ avatarUrl: string }> {
    return accounts.uploadAvatar(this.ctx, file);
  }
  quickConnectInitiate(prevSecret?: string): Promise<QuickConnectInit> {
    return quickConnect.quickConnectInitiate(this.ctx, prevSecret);
  }
  quickConnectPoll(secret: string): Promise<PairingStatus> {
    return quickConnect.quickConnectPoll(this.ctx, secret);
  }
  quickConnectAuthorize(code: string): Promise<void> {
    return quickConnect.quickConnectAuthorize(this.ctx, code);
  }

  /** Publish this device's beacon so a phone on the same network can sign it in. */
  announceHandoff(body: HandoffAnnounce): Promise<HandoffBeacon> {
    return handoff.announceHandoff(this.ctx, body);
  }
  handoffLeave(secret: string): Promise<void> {
    return handoff.handoffLeave(this.ctx, secret);
  }
  handoffPoll(secret: string): Promise<PairingStatus> {
    return handoff.handoffPoll(this.ctx, secret);
  }
  /** The TVs waiting on this device's own network. */
  handoffDevices(): Promise<HandoffDevice[]> {
    return handoff.handoffDevices(this.ctx);
  }
  /** Hand this account to one of them. */
  handoffGrant(handle: string, evidence?: HandoffEvidence): Promise<void> {
    return handoff.handoffGrant(this.ctx, handle, evidence);
  }

  progress(): Promise<ProgressEntry[]> {
    return playback.progress(this.ctx);
  }
  itemProgress(itemId: string): Promise<ProgressEntry | null> {
    return playback.itemProgress(this.ctx, itemId);
  }
  continueWatching(): Promise<ContinueItem[]> {
    return playback.continueWatching(this.ctx);
  }
  /** The episode to play to continue a show (resume / next unwatched / first). */
  upNext(showId: string): Promise<UpNext | null> {
    return playback.upNext(this.ctx, showId);
  }
  /** The next episode after an item (player autoplay), or null. */
  nextEpisode(itemId: string): Promise<MediaItem | null> {
    return playback.nextEpisode(this.ctx, itemId);
  }
  /** The upcoming episodes after an item, for the player's "up next" rail. */
  followingEpisodes(itemId: string): Promise<MediaItem[]> {
    return playback.followingEpisodes(this.ctx, itemId);
  }
  forYou(): Promise<MediaItem[]> {
    return playback.forYou(this.ctx);
  }
  saveProgress(itemId: string, positionMs: number, durationMs?: number | null): Promise<void> {
    return playback.saveProgress(this.ctx, itemId, positionMs, durationMs);
  }
  deleteProgress(itemId: string): Promise<void> {
    return playback.deleteProgress(this.ctx, itemId);
  }
  watched(): Promise<string[]> {
    return playback.watched(this.ctx);
  }
  markWatched(itemId: string): Promise<void> {
    return playback.markWatched(this.ctx, itemId);
  }
  unmarkWatched(itemId: string): Promise<void> {
    return playback.unmarkWatched(this.ctx, itemId);
  }
  myList(): Promise<string[]> {
    return playback.myList(this.ctx);
  }
  addToList(itemId: string): Promise<void> {
    return playback.addToList(this.ctx, itemId);
  }
  removeFromList(itemId: string): Promise<void> {
    return playback.removeFromList(this.ctx, itemId);
  }
  pingPlayback(ping: PlaybackPing): Promise<void> {
    return playback.pingPlayback(this.ctx, ping);
  }
  stopPlayback(sessionId: string): Promise<void> {
    return playback.stopPlayback(this.ctx, sessionId);
  }

  /** Receiver side: register + heartbeat + ack, and collect pending commands. */
  announceCast(body: CastAnnounceBody): Promise<CastAnnounceReply> {
    return cast.announceCast(this.ctx, body);
  }
  /** Receiver side: leave the roster now instead of waiting out the TTL. */
  unregisterCast(receiverId: string): Promise<void> {
    return cast.unregisterCast(this.ctx, receiverId);
  }
  /** Sender side: the live receivers, this account's own devices first. */
  castReceivers(): Promise<CastReceiver[]> {
    return cast.castReceivers(this.ctx);
  }
  /** Sender side: send one order; resolves with its sequence number. */
  sendCastCommand(receiverId: string, command: CastCommand): Promise<number> {
    return cast.sendCastCommand(this.ctx, receiverId, command);
  }

  discoverSearch(
    query: string,
    opts?: { type?: DiscoverType; page?: number },
  ): Promise<DiscoverResponse> {
    return discovery.discoverSearch(this.ctx, query, opts);
  }
  discoverTrending(opts?: { type?: DiscoverType; page?: number }): Promise<DiscoverResponse> {
    return discovery.discoverTrending(this.ctx, opts);
  }
  discoverDetail(kind: 'movie' | 'tv', tmdbId: number): Promise<DiscoverDetail> {
    return discovery.discoverDetail(this.ctx, kind, tmdbId);
  }

  matchCandidates(kind: RematchKind, id: string, query?: string): Promise<MatchCandidates> {
    return rematch.matchCandidates(this.ctx, kind, id, query);
  }
  setMatch(kind: RematchKind, id: string, tmdbId: number | null): Promise<void> {
    return rematch.setMatch(this.ctx, kind, id, tmdbId);
  }
  listRequests(opts?: { mine?: boolean }): Promise<RequestsView> {
    return requests.listRequests(this.ctx, opts);
  }
  getCalendar(opts?: { mine?: boolean }): Promise<CalendarEntry[]> {
    return requests.getCalendar(this.ctx, opts);
  }
  getMissing(opts?: { mine?: boolean }): Promise<CalendarEntry[]> {
    return requests.getMissing(this.ctx, opts);
  }
  searchAllMissing(): Promise<{ runId: string }> {
    return requests.searchAllMissing(this.ctx);
  }
  autoSearchRequest(id: string): Promise<{ grabbed: boolean; title?: string }> {
    return requests.autoSearchRequest(this.ctx, id);
  }
  createRequest(body: CreateRequestBody): Promise<MediaRequest> {
    return requests.createRequest(this.ctx, body);
  }
  deleteRequest(id: string): Promise<void> {
    return requests.deleteRequest(this.ctx, id);
  }
  approveRequest(id: string): Promise<MediaRequest> {
    return requests.approveRequest(this.ctx, id);
  }
  denyRequest(id: string, note?: string): Promise<MediaRequest> {
    return requests.denyRequest(this.ctx, id, note);
  }
  searchReleases(id: string): Promise<InteractiveSearchView> {
    return requests.searchReleases(this.ctx, id);
  }
  grabRelease(id: string, body: GrabBody): Promise<void> {
    return requests.grabRelease(this.ctx, id, body);
  }

  createReport(body: CreateReportBody): Promise<Report> {
    return reports.createReport(this.ctx, body);
  }
  listMyReports(): Promise<Report[]> {
    return reports.listMyReports(this.ctx);
  }
  adminReports(query?: ReportQuery): Promise<ReportsView> {
    return reports.adminReports(this.ctx, query);
  }
  resolveReport(id: string): Promise<Report> {
    return reports.resolveReport(this.ctx, id);
  }
  dismissReport(id: string): Promise<Report> {
    return reports.dismissReport(this.ctx, id);
  }
  reopenReport(id: string): Promise<Report> {
    return reports.reopenReport(this.ctx, id);
  }
  deleteReport(id: string): Promise<void> {
    return reports.deleteReport(this.ctx, id);
  }

  listNotifications(): Promise<NotificationsView> {
    return notifications.listNotifications(this.ctx);
  }
  markNotificationsRead(ids: string[]): Promise<{ unread: number }> {
    return notifications.markRead(this.ctx, ids);
  }
  markNotificationsUnread(ids: string[]): Promise<{ unread: number }> {
    return notifications.markUnread(this.ctx, ids);
  }
  markAllNotificationsRead(): Promise<{ unread: number }> {
    return notifications.markAllRead(this.ctx);
  }
  deleteNotification(id: string): Promise<void> {
    return notifications.deleteNotification(this.ctx, id);
  }
  getNotificationPrefs(): Promise<NotificationPrefs> {
    return notifications.getNotificationPrefs(this.ctx);
  }
  setNotificationPrefs(prefs: NotificationPrefs): Promise<NotificationPrefs> {
    return notifications.setNotificationPrefs(this.ctx, prefs);
  }
  /** Run a notification's `api` action (approve / deny straight from the row). */
  runNotificationAction(action: { href: string; method?: string }): Promise<void> {
    return notifications.runNotificationAction(this.ctx, action);
  }

  pushKey(): Promise<{ publicKey: string; subscribed: boolean }> {
    return notifications.pushKey(this.ctx);
  }
  subscribePush(body: SubscribeBody): Promise<void> {
    return notifications.subscribePush(this.ctx, body);
  }
  unsubscribePush(endpoint: string): Promise<void> {
    return notifications.unsubscribePush(this.ctx, endpoint);
  }
  testPush(): Promise<{ delivered: number }> {
    return notifications.testPush(this.ctx);
  }

  adminLibraries(): Promise<{ libraries: AdminLibrary[] }> {
    return library.adminLibraries(this.ctx);
  }
  createLibrary(body: { name: string; kind?: string; folders: string[] }): Promise<{ id: string }> {
    return library.createLibrary(this.ctx, body);
  }
  updateLibrary(
    id: string,
    patch: { name?: string; kind?: string; folders?: string[]; autoScan?: boolean },
  ): Promise<void> {
    return library.updateLibrary(this.ctx, id, patch);
  }
  deleteLibrary(id: string): Promise<void> {
    return library.deleteLibrary(this.ctx, id);
  }
  scanLibrary(id: string): Promise<void> {
    return library.scanLibrary(this.ctx, id);
  }
  /** Browse server-side directories for the library folder picker (roots when
   *  `path` is empty/absent). */
  adminBrowseFolders(path?: string): Promise<admin.AdminFsList> {
    return admin.adminBrowseFolders(this.ctx, path);
  }

  adminServer(): Promise<ServerInfo> {
    return admin.adminServer(this.ctx);
  }
  adminSessions(): Promise<{ sessions: PlaybackSession[] }> {
    return admin.adminSessions(this.ctx);
  }
  terminateSession(id: string, message?: string): Promise<void> {
    return admin.terminateSession(this.ctx, id, message);
  }
  adminMetrics(): Promise<MetricsSnapshot> {
    return admin.adminMetrics(this.ctx);
  }
  adminStorage(): Promise<StorageInfo> {
    return admin.adminStorage(this.ctx);
  }
  clearCache(): Promise<{ freedBytes: number }> {
    return admin.clearCache(this.ctx);
  }
  resetMetadata(): Promise<{ items: number; shows: number }> {
    return admin.resetMetadata(this.ctx);
  }
  adminUsers(): Promise<AdminUsers> {
    return admin.adminUsers(this.ctx);
  }
  updateUser(id: string, patch: { permissions?: Permission[]; username?: string }): Promise<void> {
    return admin.updateUser(this.ctx, id, patch);
  }
  deleteUser(id: string): Promise<void> {
    return admin.deleteUser(this.ctx, id);
  }
  adminSettings(view: string): Promise<SettingsView> {
    return admin.adminSettings(this.ctx, view);
  }
  updateSettings(patch: Record<string, unknown>): Promise<{ updated: string[] }> {
    return admin.updateSettings(this.ctx, patch);
  }
  /** Download a portable backup as a Blob; `password` encrypts it (`.kroma`). */
  exportBackup(password?: string): Promise<Blob> {
    return admin.exportBackup(this.ctx, password);
  }
  /** Restore a backup file, then trigger a re-scan. Returns per-table counts. */
  importBackup(file: Blob, opts?: admin.BackupImportOptions): Promise<admin.BackupImportResult> {
    return admin.importBackup(this.ctx, file, opts);
  }
  topUsers(days = 7): Promise<{ users: TopUser[] }> {
    return admin.topUsers(this.ctx, days);
  }
  playHistory(days = 28): Promise<HistoryStats> {
    return admin.playHistory(this.ctx, days);
  }
  adminOverview(): Promise<AdminOverview> {
    return admin.adminOverview(this.ctx);
  }

  adminLogs(
    opts: { level?: string; source?: string; q?: string; limit?: number } = {},
  ): Promise<LogsView> {
    return admin.adminLogs(this.ctx, opts);
  }

  /** Every notification kind this server can send, rendered for the console. */
  notificationSamples(): Promise<{ events: KromaNotification[] }> {
    return admin.notificationSamples(this.ctx);
  }

  /** Send one real notification: a sampled core event, or one written by hand. */
  sendNotification(body: admin.SendNotificationBody): Promise<{ delivered: number }> {
    return admin.sendNotification(this.ctx, body);
  }

  /** Store an image for a notification, returning its cached path. */
  uploadNotificationImage(file: Blob): Promise<{ imageUrl: string }> {
    return admin.uploadNotificationImage(this.ctx, file);
  }

  /** Images previously uploaded for notifications, newest first. */
  listNotificationImages(): Promise<NotificationImages> {
    return admin.listNotificationImages(this.ctx);
  }

  adminJobs(): Promise<JobsView> {
    return admin.adminJobs(this.ctx);
  }
  adminJob(key: string): Promise<JobDetail> {
    return admin.adminJob(this.ctx, key);
  }
  runJob(key: string): Promise<{ runId: string }> {
    return admin.runJob(this.ctx, key);
  }
  cancelJob(key: string): Promise<{ cancelled: boolean }> {
    return admin.cancelJob(this.ctx, key);
  }
  updateJob(key: string, patch: { schedule?: string | null; enabled?: boolean }): Promise<void> {
    return admin.updateJob(this.ctx, key, patch);
  }
  jobRunLogs(runId: string): Promise<{ logs: JobLog[] }> {
    return admin.jobRunLogs(this.ctx, runId);
  }

  adminPipeline(): Promise<PipelineView> {
    return admin.adminPipeline(this.ctx);
  }
  pipelineFailed(stage: string): Promise<{ tasks: PipelineTaskView[] }> {
    return admin.pipelineFailed(this.ctx, stage);
  }
  runPipelineStage(stage: string): Promise<{ runId: string }> {
    return admin.runPipelineStage(this.ctx, stage);
  }
  cancelPipelineStage(stage: string): Promise<{ cancelled: boolean }> {
    return admin.cancelPipelineStage(this.ctx, stage);
  }
  pausePipeline(paused: boolean): Promise<{ paused: boolean }> {
    return admin.pausePipeline(this.ctx, paused);
  }
  retryPipelineStage(stage: string): Promise<{ requeued: number }> {
    return admin.retryPipelineStage(this.ctx, stage);
  }
  reprocessPipelineStage(stage: string): Promise<{ requeued: number }> {
    return admin.reprocessPipelineStage(this.ctx, stage);
  }
  retryPipelineTask(stage: string, subjectId: string): Promise<{ requeued: number }> {
    return admin.retryPipelineTask(this.ctx, stage, subjectId);
  }
  reprocessSubject(
    kind: 'item' | 'show',
    id: string,
  ): Promise<{ subjects: number; stages: string[] }> {
    return admin.reprocessSubject(this.ctx, kind, id);
  }
  itemProcessing(id: string): Promise<ElementProcessing> {
    return admin.itemProcessing(this.ctx, id);
  }
  pipelineElements(params?: {
    status?: string;
    kind?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<PipelineElements> {
    return admin.pipelineElements(this.ctx, params);
  }
  retryElementStage(kind: 'item' | 'show', id: string, stage: string): Promise<void> {
    return admin.retryElementStage(this.ctx, kind, id, stage);
  }
  showProcessing(id: string): Promise<ElementProcessing> {
    return admin.showProcessing(this.ctx, id);
  }

  adminLlm(): Promise<LlmAdminConfig> {
    return admin.adminLlm(this.ctx);
  }
  saveLlm(body: admin.LlmSave): Promise<void> {
    return admin.saveLlm(this.ctx, body);
  }
  llmModels(probe: admin.LlmProbe): Promise<{ models: string[]; error?: string }> {
    return admin.llmModels(this.ctx, probe);
  }
  testLlm(probe: admin.LlmProbe): Promise<{ ok: boolean; message: string }> {
    return admin.testLlm(this.ctx, probe);
  }
}
