import type { SubCapabilities, SubtitleGeneration } from '@kroma/core';

/** The request {@link GenerateWizard} emits; the platform adapter maps it to its own
 * `generateSubtitle` call, so the shared chrome never imports an API client. */
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
 * `@kroma/ui` stays engine- and client-agnostic. */
export interface SubtitleGenBundle {
  canCreate: boolean;
  caps: SubCapabilities | null;
  /** Running and recently-finished generations. */
  pending: SubtitleGeneration[];
  onCancel: (id: string) => void;
  onDelete: (subId: string) => void;
  onStart: (req: SubtitleGenRequest) => void;
}

export type { PlayerSub } from '#ui/components/organisms/player/types';
