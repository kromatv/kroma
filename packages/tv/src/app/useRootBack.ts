import { useT } from '@kromatv/ui';
import { confirm, type FocusNavHandlers } from '@kromatv/ui/kit';
import { useCallback, useRef } from 'react';
import { exitNeedsConfirm } from '#tv/app/appQuit';
import { useNav } from '#tv/app/router';

/** The Back handler a root screen binds. At the bottom of the stack Back leaves
 * the app, which Samsung's key policy makes a question first, and it is
 * undefined where no shell offers a way out so Back stays unbound there. While
 * the question is up it answers `false`: the screen's listener is registered
 * before the panel's, so only leaving the press unhandled lets the panel's own
 * Back dismiss it instead of stacking a second question behind it. */
export function useRootBack(): FocusNavHandlers['onBack'] {
  const { back, canExit } = useNav();
  const t = useT();
  const asking = useRef(false);
  const ask = useCallback(() => {
    if (asking.current) return false;
    if (!exitNeedsConfirm()) {
      back();
      return;
    }
    asking.current = true;
    void confirm({
      title: t('nav.quitTitle'),
      confirmLabel: t('nav.quitConfirm'),
      cancelLabel: t('common.cancel'),
    }).then((yes) => {
      asking.current = false;
      if (yes) back();
    });
  }, [back, t]);
  return canExit ? ask : undefined;
}
