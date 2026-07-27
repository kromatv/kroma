// The DOM half of @kroma/tv: how a browser shell (Tizen, webOS, Android TV,
// desktop) puts the experience on screen.
//
// It is a SEPARATE entry, and that is the whole point. The native TV client
// bundles the same `#tv/app`, and a Metro bundle that reaches `react-dom` gets
// two Reacts (the client pins its own copy, react-dom comes from the workspace
// root) and dies before `AppRegistry` ever sees the app. Keeping `createRoot`
// off the package's main entry is what makes the two targets share a tree.

import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { TvApp, type TvAppProps } from '#tv/app/TvApp';

/** Loaded on demand: the workbench carries every story in the design system, and
 * an app that is not being inspected should not pay for them. */
const Workbench = lazy(async () => ({
  default: (await import('#tv/workbench')).Workbench,
}));

/** `?workbench` opens the design system's component atelier instead of the app:
 * every primitive, its variant matrix, and live controls. It renders from the
 * same kit the app does, on whatever target you opened it on, so it is both the
 * fastest way to see a token change land everywhere and the surface the
 * visual-regression screenshots capture. */
function wantsWorkbench(): boolean {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.has('workbench') || params.has('shot');
}

/** Mount the shared TV experience into #root. Called by each platform shell. */
export function mountTv(props: TvAppProps = {}): void {
  const el = document.getElementById('root');
  if (!el) throw new Error('KROMA TV: #root element not found');
  createRoot(el).render(
    <StrictMode>
      {wantsWorkbench() ? (
        <Suspense fallback={null}>
          <Workbench />
        </Suspense>
      ) : (
        <TvApp {...props} />
      )}
    </StrictMode>,
  );
}
