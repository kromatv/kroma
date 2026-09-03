import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import type { ItemId } from '../media';
import { GenerationId, type SubtitleId } from './ids';
import { DownloadedSub, type GenerateReq, SubCapabilities, SubtitleGeneration } from './schemas';

const GenerationStarted = z.object({ genId: GenerationId });

/** On-device subtitle generation: transcribe the audio (Whisper) or translate an
 * existing track (LLM), poll live progress, cancel, and delete generated tracks. */
export default function subtitlesApi(ctx: RequestContext) {
  return {
    /** Which generation actions this server build enables. */
    capabilities: (id: ItemId) =>
      ctx.get('/items/:id/subtitles/capabilities', SubCapabilities, { params: { id } }),

    /** This item's already-generated subtitles. */
    downloaded: (id: ItemId) =>
      ctx.get('/items/:id/subtitles/downloaded', DownloadedSub.array(), { params: { id } }),

    /** Delete a generated subtitle track (its row and its cached file). */
    delete: (id: ItemId, subId: SubtitleId) =>
      ctx.delete('/items/:id/subtitles/downloaded/:subId', { params: { id, subId } }),

    /** Start a generation. Returns at once with a `genId`; poll
     * {@link subtitlesApi.generations} for progress, then refresh the list. */
    generate: (id: ItemId, req: GenerateReq) =>
      ctx.post('/items/:id/subtitles/generate', GenerationStarted, {
        params: { id },
        body: req,
      }),

    /** Live + recently-finished generations for this item. */
    generations: (id: ItemId) =>
      ctx.get('/items/:id/subtitles/generations', SubtitleGeneration.array(), { params: { id } }),

    /** Request cancellation of a running generation. */
    cancel: (id: ItemId, genId: GenerationId) =>
      ctx.delete('/items/:id/subtitles/generations/:genId', { params: { id, genId } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    subtitles: ReturnType<typeof subtitlesApi>;
  }
}
