import { RequestKind } from '@kromatv/client/requests';
import { z } from 'zod';
import {
  AudioCodec,
  HdrFormat,
  IndexerFlag,
  QualityId,
  Resolution,
  Source,
  VideoCodec,
} from './rules-schemas';

/** Why a rule refused a release, as a screen says it in the reader's own
 *  language: a stable `rule` and whatever its sentence needs. */
export const Refusal = z.object({
  rule: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type Refusal = z.infer<typeof Refusal>;

export const MatchedFormat = z.object({ id: z.string(), name: z.string(), score: z.number() });
export type MatchedFormat = z.infer<typeof MatchedFormat>;

/** `qualityRank` is null when the profile does not allow that quality. */
export const Evaluation = z.object({
  quality: QualityId,
  qualityRank: z.number().nullable(),
  formats: z.array(MatchedFormat),
  formatScore: z.number(),
  revision: z.number(),
});
export type Evaluation = z.infer<typeof Evaluation>;

export const LanguageSet = z.object({
  original: z.boolean(),
  explicit: z.array(z.string()),
});
export type LanguageSet = z.infer<typeof LanguageSet>;

export const AudioFact = z.object({
  language: z.string().nullish(),
  codec: AudioCodec.nullish(),
  channels: z.number().nullish(),
});
export type AudioFact = z.infer<typeof AudioFact>;

export const Facts = z.object({
  name: z.string(),
  group: z.string().nullish(),
  edition: z.string().nullish(),
  resolution: Resolution.nullish(),
  source: Source.nullish(),
  codec: VideoCodec.nullish(),
  hdr: z.array(HdrFormat).default([]),
  languages: LanguageSet,
  subtitles: z.array(z.string()).default([]),
  audio: z.array(AudioFact).default([]),
  sizeBytes: z.number().nullish(),
  revision: z.number(),
  flags: z.array(IndexerFlag).default([]),
});
export type Facts = z.infer<typeof Facts>;

export const ProfileVerdict = z.object({
  profileId: z.string(),
  profileName: z.string(),
  evaluation: Evaluation,
  refusal: Refusal.nullish(),
});
export type ProfileVerdict = z.infer<typeof ProfileVerdict>;

export const RulesTestView = z.object({
  facts: Facts,
  profiles: z.array(ProfileVerdict),
});
export type RulesTestView = z.infer<typeof RulesTestView>;

export const JudgedFile = z.object({
  fileId: z.string(),
  relPath: z.string().nullish(),
  season: z.number().nullish(),
  episode: z.number().nullish(),
  episodeEnd: z.number().nullish(),
  release: z.string().nullish(),
  evaluation: Evaluation,
  belowTarget: z.boolean(),
});
export type JudgedFile = z.infer<typeof JudgedFile>;

export const TitleRulesView = z.object({
  profileId: z.string(),
  profileName: z.string(),
  customProfile: z.boolean(),
  cutoffUnmet: z.boolean(),
  files: z.array(JudgedFile),
});
export type TitleRulesView = z.infer<typeof TitleRulesView>;

/** One monitored title whose profile would still upgrade a file: `below` of its
 *  `units` (episodes, or the one film) are under the target. */
export const CutoffEntry = z.object({
  kind: RequestKind,
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullish(),
  posterUrl: z.string().nullish(),
  profileName: z.string(),
  units: z.number(),
  below: z.number(),
  bestQuality: QualityId.nullish(),
});
export type CutoffEntry = z.infer<typeof CutoffEntry>;

export const BlockedRelease = z.object({
  id: z.string(),
  kind: RequestKind,
  tmdbId: z.number(),
  releaseTitle: z.string(),
  infoHash: z.string().nullish(),
  indexerId: z.string().nullish(),
  reason: z.string(),
  addedAt: z.number(),
});
export type BlockedRelease = z.infer<typeof BlockedRelease>;

/** The tag is `kind`, not the core client's `scope`: this is the module's own
 *  route. */
export const TitleScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('movie') }),
  z.object({ kind: z.literal('season'), season: z.number() }),
  z.object({ kind: z.literal('episode'), season: z.number(), episode: z.number() }),
]);
export type TitleScope = z.infer<typeof TitleScope>;

/** One film (`{}`) or one episode of a title, as `search-now` names it. */
export const SearchUnit = z.object({
  season: z.number().nullish(),
  episode: z.number().nullish(),
});
export type SearchUnit = z.infer<typeof SearchUnit>;

export const NotStarted = z.enum(['busy', 'noIndexer', 'vpnClosed']);
export type NotStarted = z.infer<typeof NotStarted>;

/** What a `search-now` call answers: `units` is how many missing units the run
 *  will work through, absent when nothing started or when the sweep is the
 *  whole below-target list. */
export const SearchStarted = z.object({
  started: z.boolean(),
  reason: NotStarted.nullish(),
  units: z.number().nullish(),
});
export type SearchStarted = z.infer<typeof SearchStarted>;

export const Acknowledged = z.object({ ok: z.boolean() });
export type Acknowledged = z.infer<typeof Acknowledged>;

export const GrabAccepted = z.object({ id: z.string() });
export type GrabAccepted = z.infer<typeof GrabAccepted>;
