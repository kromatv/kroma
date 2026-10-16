import { RequestKind } from '@kromatv/client/requests';
import { z } from 'zod';

export const QualityId = z.enum([
  'unknown',
  'cam',
  'unknown-sd',
  'sdtv',
  'webrip-sd',
  'webdl-sd',
  'dvd',
  'bluray-sd',
  'unknown-720p',
  'hdtv-720p',
  'webrip-720p',
  'webdl-720p',
  'bluray-720p',
  'unknown-1080p',
  'hdtv-1080p',
  'webrip-1080p',
  'webdl-1080p',
  'bluray-1080p',
  'remux-1080p',
  'unknown-2160p',
  'hdtv-2160p',
  'webrip-2160p',
  'webdl-2160p',
  'bluray-2160p',
  'remux-2160p',
]);
export type QualityId = z.infer<typeof QualityId>;

export const Source = z.enum(['Remux', 'BluRay', 'WebDl', 'WebRip', 'Hdtv', 'Dvd', 'Cam']);
export type Source = z.infer<typeof Source>;

export const Resolution = z.enum(['Sd', 'R720', 'R1080', 'R2160']);
export type Resolution = z.infer<typeof Resolution>;

export const VideoCodec = z.enum(['Hevc', 'H264', 'Av1', 'Vp9', 'Xvid']);
export type VideoCodec = z.infer<typeof VideoCodec>;

export const HdrFormat = z.enum(['hdr10', 'hdr10Plus', 'dolbyVision', 'hlg']);
export type HdrFormat = z.infer<typeof HdrFormat>;

export const AudioCodec = z.enum([
  'trueHd',
  'dtsX',
  'dtsHdMa',
  'dtsHd',
  'dts',
  'eac3',
  'ac3',
  'aac',
  'flac',
  'opus',
  'pcm',
  'mp3',
]);
export type AudioCodec = z.infer<typeof AudioCodec>;

export const IndexerFlag = z.enum(['freeleech', 'internal', 'scene']);
export type IndexerFlag = z.infer<typeof IndexerFlag>;

function conditionOf<Type extends string, S extends z.ZodRawShape>(type: Type, shape: S) {
  return z.object({
    negate: z.boolean().default(false),
    required: z.boolean().default(false),
    type: z.literal(type),
    ...shape,
  });
}

/** One test a custom format applies. A pattern is a case-insensitive regex the
 *  server compiles; a `language` value is a tag (`fr`, `fr-CA`) or `original`. */
export const Condition = z.discriminatedUnion('type', [
  conditionOf('releaseTitle', { pattern: z.string() }),
  conditionOf('releaseGroup', { pattern: z.string() }),
  conditionOf('edition', { pattern: z.string() }),
  conditionOf('language', { value: z.string() }),
  conditionOf('subtitle', { value: z.string() }),
  conditionOf('source', { value: Source }),
  conditionOf('resolution', { value: Resolution }),
  conditionOf('videoCodec', { value: VideoCodec }),
  conditionOf('hdr', { value: HdrFormat.nullable() }),
  conditionOf('audio', { codec: AudioCodec.nullable(), minChannels: z.number().nullable() }),
  conditionOf('size', { minGb: z.number().nullable(), maxGb: z.number().nullable() }),
  conditionOf('indexerFlag', { value: IndexerFlag }),
]);
export type Condition = z.infer<typeof Condition>;

export const CONDITION_TYPES = [
  'releaseTitle',
  'releaseGroup',
  'edition',
  'language',
  'subtitle',
  'source',
  'resolution',
  'videoCodec',
  'hdr',
  'audio',
  'size',
  'indexerFlag',
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const CustomFormat = z.object({
  id: z.string(),
  name: z.string(),
  conditions: z.array(Condition),
});
export type CustomFormat = z.infer<typeof CustomFormat>;

export const QualityTier = z.object({
  name: z.string().nullish(),
  qualities: z.array(QualityId),
  allowed: z.boolean(),
});
export type QualityTier = z.infer<typeof QualityTier>;

/** `tiers` runs best first, and `formatScores` is keyed by custom format id: a
 *  format it does not name scores zero. */
export const QualityProfile = z.object({
  id: z.string(),
  name: z.string(),
  tiers: z.array(QualityTier),
  cutoff: QualityId,
  upgradesAllowed: z.boolean(),
  formatScores: z.record(z.string(), z.number()).default({}),
  minFormatScore: z.number().default(0),
  upgradeUntilScore: z.number().default(0),
  minUpgradeIncrement: z.number().default(1),
  mustContain: z.array(z.string()).default([]),
  mustNotContain: z.array(z.string()).default([]),
  minSeeders: z.number().default(0),
  addBeside: z.boolean().default(false),
});
export type QualityProfile = z.infer<typeof QualityProfile>;

/** How big a quality may be, in megabytes per minute of runtime. */
export const SizeLimit = z.object({
  quality: QualityId,
  min: z.number().default(0),
  preferred: z.number().nullish(),
  max: z.number().nullish(),
});
export type SizeLimit = z.infer<typeof SizeLimit>;

export const Sizes = z.object({
  movie: z.array(SizeLimit),
  episode: z.array(SizeLimit),
  movieRuntime: z.number(),
  episodeRuntime: z.number(),
});
export type Sizes = z.infer<typeof Sizes>;

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

export const RulesView = z.object({
  profiles: z.array(QualityProfile),
  defaultProfile: z.string(),
  formats: z.array(CustomFormat),
  sizes: Sizes,
  qualities: z.array(QualityId),
});
export type RulesView = z.infer<typeof RulesView>;

export const ProfileVerdict = z.object({
  profileId: z.string(),
  profileName: z.string(),
  evaluation: Evaluation,
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

/** `customProfile` is true when the title names a profile of its own rather
 *  than following the default. */
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

export const Acknowledged = z.object({ ok: z.boolean() });
export type Acknowledged = z.infer<typeof Acknowledged>;

export const GrabAccepted = z.object({ id: z.string() });
export type GrabAccepted = z.infer<typeof GrabAccepted>;
