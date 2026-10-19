import { webWindow } from '@kromatv/ui/kit';
import { mountRoot } from '@kromatv/ui/mount-root';
import { lazy, StrictMode, Suspense } from 'react';

import { cutFadesWhileMoving } from '#tv/app/cut-fades-while-moving';
import { muteTransitionEvents } from '#tv/app/mute-transition-events';
import { TvApp, type TvAppProps } from '#tv/app/TvApp';
import { BROWSER_PLAYBACK } from '#tv/features/playback/browser/browserPlayback';

const Workbench = lazy(async () => ({
  default: (await import('#tv/workbench')).Workbench,
}));

function wantsWorkbench(): boolean {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.has('workbench') || params.has('shot');
}

/** Mounts the TV app as the root; `?workbench` (or `?shot`) renders the design workbench. */
export function mountTv(props: Omit<TvAppProps, 'playback'> = {}): void {
  const win = webWindow();
  if (win) {
    muteTransitionEvents(win);
    cutFadesWhileMoving(win);
  }
  mountRoot(
    <StrictMode>
      {wantsWorkbench() ? (
        <Suspense fallback={null}>
          <Workbench />
        </Suspense>
      ) : (
        <TvApp {...props} playback={BROWSER_PLAYBACK} />
      )}
    </StrictMode>,
  );
}
