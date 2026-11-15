import { variablesOf } from '@kromatv/i18n/model';
import { inspectLocale } from '@kromatv/i18n-tools';
import { locate, parsed, reasonOf, type Sets, Target } from './sets.ts';

interface CatalogMessage {
  readonly set: string;
  readonly source: string;
  readonly reference: Readonly<Record<string, string>>;
  readonly forms: Readonly<Record<string, string>>;
  readonly variables: readonly string[];
}

interface MessageAnswer {
  readonly message: CatalogMessage | null;
  readonly refused: string | null;
}

/**
 * What the editor opens on: `payload` names a message by scope, locale and
 * key, and the answer is its forms as the catalogs hold them now. No scope is
 * the first of `sets`, the app's; a scope is the set of that name.
 */
export function describeMessage(sets: Sets, payload: unknown): MessageAnswer {
  const target = parsed(Target, payload);
  if (typeof target === 'string') return { message: null, refused: target };
  try {
    const at = locate(sets, target);
    if (typeof at === 'string') return { message: null, refused: at };
    const own = inspectLocale(at.set, at.source, target.locale).messages.get(target.key);
    const message = {
      set: at.set.name,
      source: at.source.locale,
      reference: at.message.forms,
      forms: own?.forms ?? {},
      variables: [...variablesOf(at.message).keys()],
    };
    return { message, refused: null };
  } catch (error) {
    return { message: null, refused: reasonOf(error) };
  }
}
