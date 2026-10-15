import { langName } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import type { PlayerSub } from '#ui/components/organisms/player/types';

/** What a row calls a subtitle track: a generated track's own label, else the
 * language in the viewer's locale, followed by the track's own title where the
 * file gave it one (`Anglais · SDH`). */
export function subtitleName(t: Translate, sub: PlayerSub | null | undefined): string {
  if (!sub) return t('player.subtitlesOff');
  if (sub.ai && sub.label) return sub.label;
  const language = langName(t, sub.language) || t('player.langUnknown');
  const title = sub.title?.trim();
  return title ? `${language} · ${title}` : language;
}
