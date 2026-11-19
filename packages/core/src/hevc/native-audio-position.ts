import type { AudioTrack } from '@kromatv/client/media';
import { langBase } from '../lang';

/** An audio track as a platform player lists it. Only its language is read. */
export interface NativeAudioTrack {
  language?: string | null;
}

const NO_LANGUAGE = new Set(['und', 'mis', 'mul', 'zxx']);

function isoLanguage(code?: string | null): string | null {
  const base = langBase(code);
  if (base == null || !/^[a-z]{2,3}$/.test(base) || NO_LANGUAGE.has(base)) {
    return null;
  }
  return base;
}

function sameLanguagePositions(native: readonly NativeAudioTrack[], language: string): number[] {
  return native.flatMap((candidate, i) =>
    isoLanguage(candidate.language) === language ? [i] : [],
  );
}

/**
 * Where the file's audio track `rendition` sits in a platform player's own
 * list, or null when the player does not list it. A player that opens the
 * original file lists the tracks itself, in its own order and with its own
 * language codes, so the language decides and the order among tracks of one
 * language breaks a tie. The position decides only when the language cannot,
 * and never lands on a track whose language says it is another one.
 */
export function nativeAudioPosition(
  tracks: readonly AudioTrack[],
  rendition: number,
  native: readonly NativeAudioTrack[],
): number | null {
  const want = tracks.find((t) => t.index === rendition);
  const language = isoLanguage(want?.language);
  if (want && language) {
    const rank = tracks.filter((t) => isoLanguage(t.language) === language).indexOf(want);
    const match = sameLanguagePositions(native, language)[rank];
    if (match !== undefined) {
      return match;
    }
  }
  const at = native[rendition];
  if (!at || (language && isoLanguage(at.language))) {
    return null;
  }
  return rendition;
}
