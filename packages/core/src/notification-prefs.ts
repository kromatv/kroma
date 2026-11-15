import type {
  CategoryPref,
  NotificationPrefs,
  PrefsUpdate,
  TypePref,
} from '@kromatv/client/notifications';

/** One category of the delivery matrix with the kinds listed under it. */
export interface PrefsSection {
  category: CategoryPref;
  types: TypePref[];
}

/** The matrix as a settings screen lays it out: each category, in the order
 * the server sends them, followed by its own kinds. */
export function prefsSections(prefs: NotificationPrefs): PrefsSection[] {
  return prefs.categories.map((category) => ({
    category,
    types: prefs.types.filter((type) => type.category === category.category),
  }));
}

/** The update one switch on a category sends. */
export function categorySwitched(
  category: CategoryPref,
  patch: Partial<Pick<CategoryPref, 'inApp' | 'push'>>,
): PrefsUpdate {
  return { categories: [{ ...category, ...patch }] };
}

/** The update one switch on a kind sends: both of its switches as they now
 * stand, which the server weighs against its category. */
export function typeSwitched(
  type: TypePref,
  patch: Partial<Pick<TypePref, 'inApp' | 'push'>>,
): PrefsUpdate {
  const next = { ...type, ...patch };
  return { types: [{ type: next.type, inApp: next.inApp, push: next.push }] };
}

/** One of the two ways a notification reaches its reader. */
export type NotificationChannel = 'inApp' | 'push';

/** How many of a category's kinds a channel reaches. A category that lists no
 * kind counts as one: its own switch. */
export function channelReach(
  section: PrefsSection,
  channel: NotificationChannel,
): { on: number; of: number } {
  if (section.types.length === 0) {
    return { on: section.category[channel] ? 1 : 0, of: 1 };
  }
  return {
    on: section.types.filter((type) => type[channel]).length,
    of: section.types.length,
  };
}

/** The update a category's master switch sends for one channel: the category
 * and every kind under it take the value, so no kind is left saying otherwise. */
export function sectionSwitched(
  section: PrefsSection,
  channel: NotificationChannel,
  on: boolean,
): PrefsUpdate {
  return {
    categories: [{ ...section.category, [channel]: on }],
    types: section.types.map((type) => ({
      type: type.type,
      inApp: type.inApp,
      push: type.push,
      [channel]: on,
    })),
  };
}
