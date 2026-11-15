import { pageRecord } from '../page';
import type { TranslationStatus } from '../server/host';
import type { Grade, Review, Sighting } from './mark';

interface Held {
  wanted: string | null;
  status: TranslationStatus | null;
  reviews: Map<string | null, Map<string, Review>>;
  readonly listeners: Set<() => void>;
}

const held = pageRecord<Held>('__kromaI18nDevtoolsReview', () => ({
  wanted: null,
  status: null,
  reviews: new Map(),
  listeners: new Set(),
}));

function indexed(status: TranslationStatus | null): Held['reviews'] {
  const reviews: Held['reviews'] = new Map();
  for (const { scope, outdated, unreviewed } of status?.sets ?? []) {
    const own = new Map<string, Review>();
    for (const key of unreviewed) {
      own.set(key, 'unreviewed');
    }
    for (const key of outdated) {
      own.set(key, 'outdated');
    }
    if (own.size > 0) {
      reviews.set(scope, own);
    }
  }
  return reviews;
}

function hold(state: Held, status: TranslationStatus | null): void {
  if (state.status === status) {
    return;
  }
  state.status = status;
  state.reviews = indexed(status);
  for (const listener of state.listeners) {
    listener();
  }
}

/** Say which locale's status is wanted from now on, or `null` for none. What
 *  is held for another locale is dropped at once, so no string wears a grade
 *  the lock of a different language gave it. */
export function wantStatus(locale: string | null): void {
  const state = held();
  state.wanted = locale;
  if (state.status?.locale !== locale) {
    hold(state, null);
  }
}

/** Keep `status` for the overlay and the panel to read. One that is not for
 *  the wanted locale arrived late and is left out. */
export function holdStatus(status: TranslationStatus): void {
  const state = held();
  if (status.locale === state.wanted) {
    hold(state, status);
  }
}

/** How the rendered locale stands, the same object until it is asked again,
 *  and `null` until the dev server has said. */
export function heldStatus(): TranslationStatus | null {
  return held().status;
}

export function onStatusChange(listener: () => void): () => void {
  const { listeners } = held();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether any translation on record is outdated or unreviewed: where none
 *  is, no string needs looking up. */
export function reviewing(): boolean {
  return held().reviews.size > 0;
}

/**
 * The grade the overlay shows for a message it sighted.
 *
 * What the engine said stands wherever it is about what is on screen: nothing
 * answered, a variable has no value, a fallback language answered. Only a
 * message its own catalog answered is taken further, to what the lock says of
 * that translation, and one that is both outdated and unreviewed is outdated.
 */
export function shownGrade({ grade, scope, key, locale }: Sighting): Grade {
  if (grade !== 'catalog') {
    return grade;
  }
  const state = held();
  if (state.status?.locale !== locale) {
    return grade;
  }
  return state.reviews.get(scope)?.get(key) ?? grade;
}
