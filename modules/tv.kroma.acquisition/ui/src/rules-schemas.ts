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

export const IndexerFlag = z.enum(['freeleech', 'halfleech', 'doubleUpload', 'internal', 'scene']);
export type IndexerFlag = z.infer<typeof IndexerFlag>;

export const ReleaseType = z.enum(['singleEpisode', 'multiEpisode', 'seasonPack']);
export type ReleaseType = z.infer<typeof ReleaseType>;

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
  conditionOf('releaseType', { value: ReleaseType }),
  conditionOf('year', { min: z.number().nullable(), max: z.number().nullable() }),
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
  'releaseType',
  'year',
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

export const RulesView = z.object({
  profiles: z.array(QualityProfile),
  defaultProfile: z.string(),
  formats: z.array(CustomFormat),
  sizes: Sizes,
  qualities: z.array(QualityId),
});
export type RulesView = z.infer<typeof RulesView>;
