import { z } from 'zod';
import type { RequestContext } from '../../core/client';
import {
  ContinueItem,
  ItemId,
  MediaItem,
  ProgressEntry,
  ShowId,
  type SubjectId,
  UpNext,
} from '../media';
import type { PlaybackSessionId } from './ids';
import type { PlaybackPing } from './schemas';

const TitleIds = z.array(z.union([ItemId, ShowId]));

/** Playback progress, resume rails and live-session heartbeats. */
export default function playbackApi(ctx: RequestContext) {
  return {
    /** All of the user's saved positions. */
    progress: () => ctx.get('/progress', ProgressEntry.array()),

    /** Saved position for a single item, or null if none. */
    itemProgress: (itemId: ItemId) =>
      ctx.get('/progress/:itemId', ProgressEntry.nullable(), { params: { itemId } }),

    /** Save (upsert) the playback position for an item. */
    save: (itemId: ItemId, positionMs: number, durationMs?: number | null) =>
      ctx.put('/progress/:itemId', {
        params: { itemId },
        body: { positionMs: Math.round(positionMs), durationMs: durationMs ?? null },
      }),

    /** Forget an item's position (finished / removed from Continue Watching). */
    forget: (itemId: ItemId) => ctx.delete('/progress/:itemId', { params: { itemId } }),

    /** Resumable items, newest first (the "Reprendre la lecture" rail). */
    continueWatching: () => ctx.get('/continue', ContinueItem.array()),

    /** The episode to play to CONTINUE a show (resume in-progress, else next
     * unwatched, else first) plus a `resume` flag for the button label. `null`
     * when the show has no episodes. */
    upNext: (showId: ShowId) =>
      ctx.get('/shows/:showId/up-next', UpNext.nullable(), { params: { showId } }),

    /** The next episode after `itemId` in its show, or `null` for a movie / the
     * last episode. Drives player autoplay. */
    nextEpisode: (itemId: ItemId) =>
      ctx.get('/items/:itemId/next', MediaItem.nullable(), { params: { itemId } }),

    /** The upcoming episodes after `itemId`, for the player's "up next" rail.
     * Empty for a movie / the last episode. */
    following: (itemId: ItemId) =>
      ctx.get('/items/:itemId/following', MediaItem.array(), { params: { itemId } }),

    /** Personalized "For You" picks from the watch history (Bearer). Empty until
     * the account has watched something embeddable. */
    forYou: () => ctx.get('/for-you', MediaItem.array()),

    /** Item ids the user has marked (or finished) as watched. Clients hydrate
     * this into a set once and badge cards from it. */
    watched: () => ctx.get('/watched', ItemId.array()),

    /** Mark an item as watched (also clears its resume position). */
    markWatched: (itemId: ItemId) => ctx.put('/watched/:itemId', { params: { itemId } }),

    /** Clear an item's watched flag. */
    unmarkWatched: (itemId: ItemId) => ctx.delete('/watched/:itemId', { params: { itemId } }),

    /** Item AND show ids in the user's "Ma liste", newest first. */
    myList: () => ctx.get('/my-list', TitleIds),

    /** Add a title to the user's list. */
    addToList: (id: SubjectId) => ctx.put('/my-list/:id', { params: { id } }),

    /** Remove a title from the user's list. */
    removeFromList: (id: SubjectId) => ctx.delete('/my-list/:id', { params: { id } }),

    /** Report playback state so the admin dashboard can show a live session. */
    ping: (ping: PlaybackPing) => ctx.post('/playback/ping', { body: ping }),

    /** End a playback session (logs it to history immediately). */
    stop: (sessionId: PlaybackSessionId) => ctx.post('/playback/stop', { body: { sessionId } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    playback: ReturnType<typeof playbackApi>;
  }
}
