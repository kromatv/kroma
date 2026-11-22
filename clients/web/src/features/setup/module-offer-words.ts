import { moduleWords } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import type { Offer } from '#web/features/setup/module-offers';
import { permissionGroups } from '#web/shared/lib/module-permissions';
import { declaredSource } from '#web/shared/lib/module-permissions-declared';
import { CATEGORY_VIEW } from '#web/shared/lib/module-permissions-view';

/** How the setup names an offer in the owner's language: the module's name,
 *  and the sentence it is offered by, or why this server cannot take it. */
export function offerWords(offer: Offer, locale: string): { name: string; sentence: string } {
  const words = moduleWords(offer.module, locale);
  const own = words.tagline ?? words.description;
  return {
    name: words.name,
    sentence: offer.module.compatible ? own : (offer.module.reason ?? own),
  };
}

/** What an offer may reach, a few words for each kind of access. Empty for a
 *  module that does not say. */
export function offerReach(offer: Offer, t: Translate): string[] {
  const source = declaredSource(offer.module);
  if (!source) {
    return [];
  }
  return permissionGroups(source, t).map((group) => t(CATEGORY_VIEW[group.category].title));
}
