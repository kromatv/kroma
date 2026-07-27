import {
  GEN_LANGS,
  type KromaClient,
  LANG_OFF,
  type MediaItem,
  type SubCapabilities,
} from '@kroma/core';
import {
  type PlayerSub,
  type SubtitleGenBundle,
  type SubtitleGenRequest,
  useSubtitleGenerations,
} from '@kroma/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LangPrefs } from '#tv/app/langPref';
import { useSubtitleSelection } from '#tv/features/playback/player/useSubtitleSelection';

export interface TvSubtitles {
  subtitles: PlayerSub[];
  activeIndex: number | null;
  setActive: (index: number | null) => void;
  subtitleGen: SubtitleGenBundle;
}

/**
 * TV subtitle state for the shared player: the renderable tracks (embedded +
 * on-device generated) mapped to {@link PlayerSub}, plus the prop-driven
 * generation bundle the shared Settings panel consumes. Wraps the existing
 * `useSubtitleSelection` and the shared generation poll.
 *
 * The account's preferred subtitle language is applied on open AND updated by
 * the picker: turning on French subtitles here is what makes the next title
 * open with French subtitles too.
 */
export function useTvSubtitles(
  client: KromaClient,
  item: MediaItem,
  langs: LangPrefs,
): TvSubtitles {
  const sel = useSubtitleSelection(client, item, langs.subtitle);
  const [caps, setCaps] = useState<SubCapabilities | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .subtitleCapabilities(item.id)
      .then((c) => !cancelled && setCaps(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, item.id]);

  const { generations, cancel, refresh } = useSubtitleGenerations(client, item.id, {
    active: true,
    onComplete: sel.reload,
  });

  const subtitles = useMemo<PlayerSub[]>(
    () =>
      sel.rendered.map((s) => ({
        index: s.index,
        language: s.language,
        label: s.label,
        codec: s.ai ? 'SRT' : (item.subtitles[s.index]?.codec ?? 'SUB'),
        url: s.url,
        ai: s.ai,
        selectable: Boolean(s.url),
        subId: s.subId,
      })),
    [sel.rendered, item.subtitles],
  );

  // A pick is also a preference. Turning subtitles OFF is a real choice, so it
  // is remembered as such; picking a track whose language the file never
  // declared leaves the stored preference alone (there is nothing to store).
  const { pick } = sel;
  const { setSubtitle } = langs;
  const setActive = useCallback(
    (index: number | null) => {
      pick(index);
      if (index == null) {
        setSubtitle(LANG_OFF);
        return;
      }
      const language = sel.rendered.find((s) => s.index === index)?.language;
      if (language) setSubtitle(language);
    },
    [pick, setSubtitle, sel.rendered],
  );

  const onDelete = useCallback(
    (subId: string) => {
      void client
        .deleteSubtitle(item.id, subId)
        .then(() => sel.reload())
        .catch(() => undefined);
    },
    [client, item.id, sel],
  );

  const onStart = useCallback(
    (req: SubtitleGenRequest) => {
      const lang = GEN_LANGS.find((l) => l.code === req.lang) ?? GEN_LANGS[0];
      if (!lang) return;
      const done = () => {
        refresh();
        sel.reload();
      };
      if (req.mode === 'transcribe') {
        void client
          .generateSubtitle(item.id, {
            mode: 'transcribe',
            lang: lang.label,
            spokenLang: lang.code,
            quality: req.quality ?? 'balanced',
          })
          .then(done)
          .catch(() => undefined);
      } else {
        const src = sel.rendered.find((s) => s.index === req.sourceIndex && s.url);
        if (!src) return;
        void client
          .generateSubtitle(item.id, {
            mode: 'translate',
            lang: lang.label,
            ...(src.subId ? { sourceSubId: src.subId } : { sourceTrack: src.index }),
          })
          .then(done)
          .catch(() => undefined);
      }
    },
    [client, item.id, sel, refresh],
  );

  const subtitleGen: SubtitleGenBundle = {
    canCreate: Boolean(caps?.transcribe || caps?.translate),
    caps,
    pending: generations.filter((g) => g.status !== 'done'),
    onCancel: cancel,
    onDelete,
    onStart,
  };

  return { subtitles, activeIndex: sel.active, setActive, subtitleGen };
}
