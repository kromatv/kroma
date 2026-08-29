import { useEffect, useState } from 'react';
import { ask } from './host';

/** An editor the machine running the dev server can open a file in. */
export interface Editor {
  readonly id: string;
  readonly name: string;
}

const NONE: readonly Editor[] = [];

let asked: Promise<readonly Editor[]> | null = null;

function fetchEditors(): Promise<readonly Editor[]> {
  asked ??= ask('kroma:i18n:editors', {}).then((answer) => answer?.editors ?? NONE);
  return asked;
}

/** What this machine can open a file in, asked for once. Empty until the dev
 *  server answers, and empty for good where it does not serve the route. */
export function useEditors(): readonly Editor[] {
  const [editors, setEditors] = useState(NONE);
  useEffect(() => {
    let live = true;
    void fetchEditors().then((found) => {
      if (live) setEditors(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return editors;
}

/** Open `file` in `editor`, or in whichever one the dev server guesses when
 *  the panel has no preference. Said out loud rather than swallowed: a control
 *  that does nothing is worse than one that explains itself. */
export function openInEditor(file: string, editor: string | null): void {
  void ask('kroma:i18n:open', { file, editor }).then((answer) => {
    if (answer?.opened) return;
    console.warn(`[i18n] could not open ${file}. Pick an editor in the i18n panel.`);
  });
}
