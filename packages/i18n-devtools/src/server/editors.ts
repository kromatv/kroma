import { useCallback, useEffect, useState } from 'react';
import { ask } from './host';

/** An editor the machine running the dev server can open a file in. */
export interface Editor {
  readonly id: string;
  readonly name: string;
}

const NONE: readonly Editor[] = [];

/** Discover on opening the options, or on demand after an editor is installed. */
export function useEditors() {
  const [editors, setEditors] = useState(NONE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(false);
    void ask('kroma:i18n:editors', {}).then((answer) => {
      if (!live) return;
      if (answer) setEditors(answer.editors);
      setError(answer === null);
      setLoading(false);
    });
    return () => { live = false; };
  }, [revision]);
  return { editors, loading, error, refresh };
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
