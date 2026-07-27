import type { SubCapabilities, SubtitleGeneration } from '@kroma/core';

/**
 * A prop-driven subtitle-generation request the {@link GenerateWizard} emits.
 * The platform adapter (web / TV) maps this to its `generateSubtitle` API call,
 * so the shared chrome never imports an API client.
 */
export interface SubtitleGenRequest {
  mode: 'transcribe' | 'translate';
  /** Spoken language to transcribe (transcribe mode). */
  lang?: string;
  /** Source subtitle track index (translate mode). */
  sourceIndex?: number;
  /** Whisper model tier (transcribe mode). */
  quality?: 'fast' | 'balanced' | 'accurate';
}

/**
 * Everything the Subtitles panel needs to drive on-device generation: what the
 * server can do, the live/queued generations, and the four callbacks the parent
 * wires to its API + selection. Kept prop-driven so `@kroma/ui` stays engine- and
 * client-agnostic.
 */
export interface SubtitleGenBundle {
  /** Whether the "create missing subtitle" affordance should be shown. */
  canCreate: boolean;
  /** Capabilities gating the wizard's transcribe / translate modes. */
  caps: SubCapabilities | null;
  /** Running / recently-finished generations, rendered as live rows. */
  pending: SubtitleGeneration[];
  /** Cancel a running generation by its id. */
  onCancel: (id: string) => void;
  /** Delete an already-generated track by its subtitle id. */
  onDelete: (subId: string) => void;
  /** Start a new generation from the wizard's request. */
  onStart: (req: SubtitleGenRequest) => void;
}

/** Re-exported for the panels that consume generation sources. */
export type { PlayerSub } from '#ui/components/organisms/player/types';
