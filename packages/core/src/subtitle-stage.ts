import type { MessageKey } from '@kromatv/i18n';

/** `stage` values come from the server's GenRegistry. */
export function subtitleStageKey(stage: string): MessageKey {
  switch (stage) {
    case 'model':
      return 'player.subStageModel';
    case 'extract':
      return 'player.subStageExtract';
    case 'transcribe':
      return 'player.subStageTranscribe';
    case 'translate':
      return 'player.subStageTranslate';
    case 'error':
      return 'player.subStageError';
    default:
      return 'player.subStageQueued';
  }
}

export function subtitleEtaTime(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)} min` : `${Math.max(1, Math.round(sec))} s`;
}
