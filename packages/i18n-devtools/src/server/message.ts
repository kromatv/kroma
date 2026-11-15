import { useEffect, useState } from 'react';
import type { MessageTarget } from '../overlay/message-target';
import { ask, type CatalogMessage } from './host';

type LoadedMessage =
  | { readonly state: 'loading' }
  | { readonly state: 'refused'; readonly reason: string }
  | { readonly state: 'ready'; readonly message: CatalogMessage };

const LOADING: LoadedMessage = { state: 'loading' };
const UNREACHABLE = 'Could not reach the dev server.';

/** Read `target` off the catalogs on disk, again whenever it names another
 *  message. */
export function useMessage({ scope, locale, key }: MessageTarget): LoadedMessage {
  const [loaded, setLoaded] = useState(LOADING);
  useEffect(() => {
    let live = true;
    setLoaded(LOADING);
    void ask('kroma:i18n:message', { scope, locale, key }).then((answer) => {
      if (!live) return;
      setLoaded(
        answer?.message
          ? { state: 'ready', message: answer.message }
          : { state: 'refused', reason: answer?.refused ?? UNREACHABLE },
      );
    });
    return () => {
      live = false;
    };
  }, [scope, locale, key]);
  return loaded;
}

/** Have the dev server write `forms`, each a text by the catalog key it goes
 *  under, into the catalog of `target`. Resolves to `null` once written, and
 *  to the reason where nothing was. */
export async function saveMessage(
  target: MessageTarget,
  forms: Readonly<Record<string, string>>,
): Promise<string | null> {
  const { scope, locale, key } = target;
  const answer = await ask('kroma:i18n:edit', { scope, locale, key, forms });
  return answer ? answer.refused : UNREACHABLE;
}
