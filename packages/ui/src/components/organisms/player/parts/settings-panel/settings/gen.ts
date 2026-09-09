import type {
  PlayerSubCapabilities,
  PlayerSubtitleGeneration,
} from '#ui/components/organisms/player/media-types';

/** The request {@link GenerateWizard} emits; the platform adapter maps it to its own
 * `subtitles.generate` call, so the shared chrome never imports an API client. */
export interface SubtitleGenRequest {
  mode: 'transcribe' | 'translate';
  /** Spoken language to transcribe (transcribe mode). */
  lang?: string;
  /** Source subtitle track index (translate mode). */
  sourceIndex?: number;
  /** Whisper model tier (transcribe mode). */
  quality?: 'fast' | 'balanced' | 'accurate';
}

/** Everything the Subtitles panel needs to drive generation, kept prop-driven so
 * `@kromatv/ui` stays engine- and client-agnostic. */
export interface SubtitleGenBundle {
  canCreate: boolean;
  caps: PlayerSubCapabilities | null;
  /** Running and recently-finished generations. */
  pending: PlayerSubtitleGeneration[];
  onCancel: (id: string) => void;
  onDelete: (subId: string) => void;
  onStart: (req: SubtitleGenRequest) => void;
}

export type { PlayerSub } from '#ui/components/organisms/player/types';
