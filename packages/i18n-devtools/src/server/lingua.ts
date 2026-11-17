import { useEffect, useRef, useState } from 'react';
import { engine } from '../engine/engine';
import type { MessageTarget } from '../overlay/message-target';
import { ask, type Lingua } from './host';

/** Where the repository translates, asked of the dev server the first time
 *  the page is `inspected`: `null` until it answers, and for good without a
 *  `lingua.json` or a git remote. A dev server that does not answer in time
 *  is asked again the next time inspecting starts. Never asked of an engine
 *  that is not `writable`, whose catalogs the dev server does not know. */
export function useLingua(inspected: boolean): Lingua | null {
  const [lingua, setLingua] = useState<Lingua | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!inspected || asked.current || !engine().writable) {
      return;
    }
    asked.current = true;
    void ask('kroma:i18n:lingua', {}).then((answer) => {
      asked.current = answer !== null;
      setLingua(answer?.lingua ?? null);
    });
  }, [inspected]);
  return lingua;
}

/** The Lingua page of the message `target` names, or `null` where there is
 *  none: no Lingua, no message, or a module's message, which Lingua does not
 *  keep. */
export function linguaLink(lingua: Lingua | null, target: MessageTarget | null): string | null {
  if (!lingua || target?.scope !== null) {
    return null;
  }
  const locale = encodeURIComponent(target.locale);
  return `${lingua.url}/go/${lingua.project}/${locale}/${encodeURIComponent(target.key)}`;
}

/** Open the Lingua page of `target` in a new tab, where it has one. */
export function openInLingua(lingua: Lingua | null, target: MessageTarget | null): void {
  const link = linguaLink(lingua, target);
  if (link) {
    window.open(link, '_blank', 'noopener');
  }
}
