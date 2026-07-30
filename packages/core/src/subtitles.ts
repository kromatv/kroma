// WebVTT parsing + active-cue lookup for the clients' own subtitle renderers:
// cross-origin <track> cues never load, so each client parses the VTT itself.

// Image subs (PGS/VobSub) are absent because they cannot render in a <track>.
const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'vtt']);

export function isTextSubtitle(codec: string): boolean {
  return TEXT_SUB_CODECS.has(codec);
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

// Stripped until stable, not in one pass: removing the inner tag of `<<i>>`
// leaves `<>` on screen. Each pass shortens the string, so this terminates.
function clean(text: string): string {
  return stripPairs(stripPairs(text, /<[^<>]*>/g), /\{[^{}]*\}/g).trim();
}

function stripPairs(text: string, pattern: RegExp): string {
  let out = text;
  let previous: string;
  do {
    previous = out;
    out = out.replace(pattern, '');
  } while (out !== previous);
  return out;
}

function parseTs(ts: string): number {
  const parts = ts.replace(',', '.').split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + (Number.isFinite(p) ? p : 0), 0);
}

/** Parses WebVTT into cues sorted by start time. */
export function parseVtt(raw: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of raw.replaceAll('\r', '').split('\n\n')) {
    const lines = block.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti === -1) continue;
    const timing = lines[ti];
    if (timing === undefined) continue;
    const [a, b] = timing.split('-->').map((s) => s.trim().split(/\s+/)[0] ?? '');
    const start = parseTs(a ?? '');
    const end = parseTs(b ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const text = clean(lines.slice(ti + 1).join('\n'));
    if (text) cues.push({ start, end, text });
  }
  return cues.sort((x, y) => x.start - y.start);
}

type CueHit = { text: string; index: number };

function walkForwardCue(cues: Cue[], t: number, hint: number): CueHit | null {
  for (let i = hint + 1; i < cues.length && i <= hint + 3; i++) {
    const c = cues[i];
    if (!c) continue;
    if (t < c.start) return { text: '', index: hint };
    if (t <= c.end) return { text: c.text, index: i };
  }
  return null;
}

function binarySearchCue(cues: Cue[], t: number): CueHit {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (!c) break;
    if (t < c.start) hi = mid - 1;
    else if (t > c.end) lo = mid + 1;
    else return { text: c.text, index: mid };
  }
  return { text: '', index: Math.max(0, lo - 1) };
}

/** `hint` is the index this returned last time; passing it back keeps normal
 *  playback O(1) amortised, and a seek re-syncs with a binary search. */
export function activeCueText(cues: Cue[], t: number, hint: number): CueHit {
  if (cues.length === 0) return { text: '', index: 0 };

  const cur = cues[hint];
  if (cur && t >= cur.start && t <= cur.end) return { text: cur.text, index: hint };
  if (cur && t > cur.end) {
    const forward = walkForwardCue(cues, t, hint);
    if (forward) return forward;
  }
  return binarySearchCue(cues, t);
}

import type { MessageKey } from './i18n';

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
