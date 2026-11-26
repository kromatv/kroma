import { normalizeLocale } from '@kromatv/core';
import type { Locale } from '@kromatv/i18n';
import { useLocales } from 'expo-localization';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
} from 'react';
import { setSystemLanguage } from '../../modules/app-language';
import { type LanguageSync, syncLanguage } from './language-sync';
import { loadPref, savePref } from './storage';

const CHOSEN_PREF = 'locale';
const SEEN_PREF = 'systemLocale';

const IDLE: LanguageSync = { remember: null, follow: null, hand: null };

interface Stored {
  chosen: Locale | null;
  lastSeen: Locale | null;
}

/** The language picked on this device, the system's language for the app,
 *  and the one way to pick: in the app, or by following the system. */
export interface LanguageChoice {
  chosen: Locale | null;
  system: Locale | null;
  choose: (locale: Locale) => void;
}

interface LanguageChoiceOptions {
  ready: boolean;
  onChoose: (locale: Locale) => void;
}

interface SyncStepOptions {
  onChoose: (locale: Locale) => void;
  setStored: Dispatch<SetStateAction<Stored | null>>;
}

function firstOffered(tags: readonly string[]): Locale | null {
  return tags.flatMap((tag) => normalizeLocale(tag) ?? [])[0] ?? null;
}

async function loadStored(): Promise<Stored> {
  const [chosen, lastSeen] = await Promise.all([loadPref(CHOSEN_PREF), loadPref(SEEN_PREF)]);
  return { chosen: normalizeLocale(chosen), lastSeen: normalizeLocale(lastSeen) };
}

async function applySync(step: LanguageSync): Promise<Partial<Stored>> {
  if (step.hand) {
    await setSystemLanguage(step.hand).catch(() => undefined);
  }
  if (step.follow) {
    await savePref(CHOSEN_PREF, step.follow);
  }
  if (step.remember) {
    await savePref(SEEN_PREF, step.remember);
  }
  return {
    ...(step.follow ? { chosen: step.follow } : {}),
    ...(step.remember ? { lastSeen: step.remember } : {}),
  };
}

function useStored(): [Stored | null, Dispatch<SetStateAction<Stored | null>>] {
  const [stored, setStored] = useState<Stored | null>(null);
  useEffect(() => {
    void loadStored().then((loaded) => setStored((current) => current ?? loaded));
  }, []);
  return [stored, setStored];
}

function useSyncStep({ remember, follow, hand }: LanguageSync, options: SyncStepOptions) {
  const carryOut = useEffectEvent((step: LanguageSync) => {
    if (step.follow) {
      options.onChoose(step.follow);
    }
    void applySync(step).then((saved) =>
      options.setStored((current) => current && { ...current, ...saved }),
    );
  });
  useEffect(() => {
    if (remember || follow || hand) {
      carryOut({ remember, follow, hand });
    }
  }, [remember, follow, hand]);
}

/**
 * Keeps the language picked on this device and the system's own setting for
 * the app in step. Once `ready`, a system language that moved since the app
 * last looked is followed, and otherwise the app's choice is handed to the
 * system where it may be set. `onChoose` hears every choice, either way.
 */
export function useLanguageChoice({ ready, onChoose }: LanguageChoiceOptions): LanguageChoice {
  const system = firstOffered(useLocales().map((locale) => locale.languageTag));
  const [stored, setStored] = useStored();
  const step = stored && ready ? syncLanguage({ ...stored, system }) : IDLE;
  useSyncStep(step, { onChoose, setStored });

  const choose = useCallback(
    (next: Locale) => {
      setStored((current) => ({ lastSeen: current?.lastSeen ?? null, chosen: next }));
      void savePref(CHOSEN_PREF, next);
      onChoose(next);
    },
    [onChoose, setStored],
  );

  return { chosen: step.follow ?? stored?.chosen ?? null, system, choose };
}
