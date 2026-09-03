import { z } from 'zod';
import { GenerationId, SubtitleId } from './ids';

/** Generation mode: speech-to-text, or translate an existing track. */
export const GenMode = z.enum(['transcribe', 'translate']);
export type GenMode = z.infer<typeof GenMode>;

/** Whisper model tier (Rapide / Équilibré / Précis). */
export const GenQuality = z.enum(['fast', 'balanced', 'accurate']);
export type GenQuality = z.infer<typeof GenQuality>;

/** Whisper model tiers offered by the generate sheet, in order. */
export const GEN_QUALITIES = GenQuality.options;

/** Target / spoken languages offered by the generate sheet. `code` is the
 * Whisper hint; `label` is the track name, chosen so the server resolves it back
 * to a language code. One source of truth for every client's generate UI. */
export const GEN_LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ja', label: 'Japonais' },
  { code: 'ko', label: 'Coréen' },
  { code: 'zh', label: 'Chinois' },
  { code: 'ru', label: 'Russe' },
  { code: 'ar', label: 'Arabe' },
];

/** A generated + cached subtitle, with its WebVTT URL (relative to the server). */
export const DownloadedSub = z.object({
  id: SubtitleId,
  language: z.string().nullable(),
  label: z.string(),
  provider: z.string(),
  url: z.string(),
});
export type DownloadedSub = z.infer<typeof DownloadedSub>;

/** Which generation actions the server build + config enable, so a client can
 * hide UI that would do nothing. */
export const SubCapabilities = z.object({
  transcribe: z.boolean(),
  translate: z.boolean(),
});
export type SubCapabilities = z.infer<typeof SubCapabilities>;

/** A generation request. For `translate`, give `sourceTrack` (an embedded index)
 * or `sourceSubId` (a generated track); the server resolves the source text. */
export const GenerateReq = z.object({
  mode: GenMode,
  lang: z.string(),
  spokenLang: z.string().optional(),
  quality: GenQuality.optional(),
  audioTrack: z.number().optional(),
  sourceTrack: z.number().optional(),
  sourceSubId: SubtitleId.optional(),
});
export type GenerateReq = z.infer<typeof GenerateReq>;

/** A live (or recently finished) generation, as polled. `progress` is 0..1. */
export const SubtitleGeneration = z.object({
  id: GenerationId,
  mode: GenMode,
  lang: z.string().nullable(),
  stage: z.string(),
  status: z.enum(['running', 'done', 'error']),
  progress: z.number(),
  etaSec: z.number().nullable(),
  error: z.string().nullable(),
  subId: SubtitleId.nullable(),
});
export type SubtitleGeneration = z.infer<typeof SubtitleGeneration>;
