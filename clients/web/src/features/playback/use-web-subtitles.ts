import {
  type DownloadedSub,
  GEN_LANGS,
  LANG_OFF,
  langName,
  preferredSubIndex,
  type SubCapabilities,
  type Translate,
} from '@kroma/core';
import {
  type PlayerSub,
  type SubtitleGenBundle,
  type SubtitleGenRequest,
  useSubtitleGenerations,
} from '@kroma/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { kromaClient, type MovieView, type SubtitleView } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useLangPrefs } from '#web/shared/lib/lang-pref';

export interface WebSubtitles {
  subtitles: PlayerSub[];
  activeIndex: number | null;
  setActive: (index: number | null) => void;
  subtitleGen: SubtitleGenBundle;
  label: string;
}

/**
 * Web subtitle state: the embedded tracks merged with online/AI-generated ones,
 * the active selection (with the account's preferred language auto-applied once),
 * plus the prop-driven generation bundle the shared Settings panel consumes. AI
 * tracks get indices 1000+ so they never collide with embedded ones.
 */
export function useWebSubtitles(item: MovieView, t: Translate): WebSubtitles {
  const { user } = useAuth();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<DownloadedSub[]>([]);
  const [caps, setCaps] = useState<SubCapabilities | null>(null);

  // Auto-enable the account's preferred subtitle language once, when hydrated.
  const prefApplied = useRef(false);
  useEffect(() => {
    if (prefApplied.current || !user) return;
    prefApplied.current = true;
    const idx = preferredSubIndex(
      item.subs.map((s) => ({ ...s, generated: s.downloaded })),
      user.subtitleLanguage,
    );
    if (idx != null) setActiveIndex(idx);
  }, [user, item.subs]);

  // Initial fetch of already-downloaded/generated tracks + capabilities.
  useEffect(() => {
    let cancelled = false;
    kromaClient()
      .downloadedSubtitles(item.id)
      .then((d) => !cancelled && setDownloaded(d))
      .catch(() => undefined);
    kromaClient()
      .subtitleCapabilities(item.id)
      .then((c) => !cancelled && setCaps(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  // A finished generation: merge the fresh list and select ONLY the produced track.
  const onComplete = useCallback(
    (subId: string) => {
      kromaClient()
        .downloadedSubtitles(item.id)
        .then((list) => {
          setDownloaded(list);
          const i = list.findIndex((d) => d.id === subId);
          if (i >= 0) setActiveIndex(1000 + i);
        })
        .catch(() => undefined);
    },
    [item.id],
  );
  const { generations, cancel, refresh } = useSubtitleGenerations(kromaClient(), item.id, {
    active: true,
    onComplete,
  });

  const allSubs = useMemo<SubtitleView[]>(() => {
    const dl: SubtitleView[] = downloaded.map((d, i) => ({
      index: 1000 + i,
      language: d.language,
      codec: 'SRT',
      url: kromaClient().resolveArt(d.url) ?? d.url,
      downloaded: true,
      label: d.label,
      subId: d.id,
      provider: d.provider,
    }));
    return [...item.subs, ...dl];
  }, [item.subs, downloaded]);

  const subtitles = useMemo<PlayerSub[]>(
    () =>
      allSubs.map((s) => ({
        index: s.index,
        language: s.language,
        label: s.label,
        codec: s.codec,
        url: s.url,
        ai: Boolean(s.downloaded),
        selectable: Boolean(s.url),
        subId: s.subId,
      })),
    [allSubs],
  );

  const onDelete = useCallback(
    (subId: string) => {
      const di = downloaded.findIndex((p) => p.id === subId);
      setDownloaded((prev) => prev.filter((p) => p.id !== subId));
      if (di >= 0) {
        setActiveIndex((cur) => {
          if (cur == null || cur < 1000) return cur;
          if (cur === 1000 + di) return null;
          if (cur > 1000 + di) return cur - 1;
          return cur;
        });
      }
      void kromaClient()
        .deleteSubtitle(item.id, subId)
        .catch(() => undefined);
    },
    [item.id, downloaded],
  );

  const onStart = useCallback(
    (req: SubtitleGenRequest) => {
      const target = GEN_LANGS.find((l) => l.code === req.lang) ?? GEN_LANGS[0];
      if (!target) return;
      const done = () => {
        kromaClient()
          .downloadedSubtitles(item.id)
          .then(setDownloaded)
          .catch(() => undefined);
        refresh();
      };
      if (req.mode === 'transcribe') {
        void kromaClient()
          .generateSubtitle(item.id, {
            mode: 'transcribe',
            lang: target.label,
            spokenLang: target.code,
            quality: req.quality ?? 'balanced',
          })
          .then(done)
          .catch(() => undefined);
      } else {
        const src = allSubs.find((s) => s.index === req.sourceIndex && s.url);
        if (!src) return;
        void kromaClient()
          .generateSubtitle(item.id, {
            mode: 'translate',
            lang: target.label,
            ...(src.subId ? { sourceSubId: src.subId } : { sourceTrack: src.index }),
          })
          .then(done)
          .catch(() => undefined);
      }
    },
    [item.id, allSubs, refresh],
  );

  const subtitleGen: SubtitleGenBundle = {
    canCreate: Boolean(caps?.transcribe || caps?.translate),
    caps,
    pending: generations.filter((g) => g.status !== 'done'),
    onCancel: cancel,
    onDelete,
    onStart,
  };

  // Turning subtitles off is a real choice and is remembered as such; picking a
  // track whose language the file never declared leaves the preference alone.
  const { setSubtitle } = useLangPrefs();
  const setActive = useCallback(
    (index: number | null) => {
      setActiveIndex(index);
      if (index == null) {
        setSubtitle(LANG_OFF);
        return;
      }
      const language = allSubs.find((s) => s.index === index)?.language;
      if (language) setSubtitle(language);
    },
    [setSubtitle, allSubs],
  );

  const active = activeIndex == null ? null : allSubs.find((s) => s.index === activeIndex);
  const label =
    activeIndex == null
      ? t('player.subtitlesOff')
      : active?.label || langName(t, active?.language) || t('player.langUnknown');

  return { subtitles, activeIndex, setActive, subtitleGen, label };
}
