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
