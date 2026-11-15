import type { AudioTrack } from '@kromatv/client/media';
import type { MessageKey, Translate } from '@kromatv/i18n';
import { channelLabel } from './format';
import { offeredLang } from './lang';
import { type LangCode, PREF_LANGS } from './lang-table';

export function langKey(code?: string | null): MessageKey | null {
  const offered = offeredLang(code);
  return offered ? `lang.${offered}` : null;
}

export interface LangOption {
  code: LangCode;
  label: string;
}

/** {@link PREF_LANGS} as picker rows, labelled for `locale` and sorted by label
 * with that locale's collator. Built fresh per call. */
export function langOptions(t: Translate, locale?: string): LangOption[] {
  const options = PREF_LANGS.map((code) => ({ code, label: t(`lang.${code}`) }));
  return options.sort(byLabel(locale));
}

function byLabel(locale?: string): (a: LangOption, b: LangOption) => number {
  try {
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    return (a, b) => collator.compare(a.label, b.label);
  } catch {
    return (a, b) => {
      if (a.label === b.label) return 0;
      return a.label < b.label ? -1 : 1;
    };
  }
}

/** Localized language name for an ISO code (any spelling `langBase` knows, so
 * "fre"/"fra"/"fr-FR" all read "Français"), the upper-cased code if unknown, or
 * null when there is no code at all. */
export function langName(t: Translate, code: string | null | undefined): string | null {
  if (!code) return null;
  const key = langKey(code);
  return key ? t(key) : code.toUpperCase();
}

/** Concise label for a selected audio track, language first: "Français · 5.1 ·
 * EAC3" (a stream `title` tag wins over the language name). Undefined when
 * there is no track. */
export function audioTrackLabel(
  t: Translate,
  track: AudioTrack | null | undefined,
): string | undefined {
  if (!track) return undefined;
  const name = track.title?.trim() || langName(t, track.language) || undefined;
  const codec = track.codec ? track.codec.toUpperCase() : undefined;
  const label = [name, channelLabel(track.channels), codec].filter(Boolean).join(' · ');
  return label || undefined;
}
