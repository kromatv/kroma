// The DOM half of @kroma/tv, for a browser shell (Tizen, webOS, Android TV,
// desktop). It must stay a separate entry: a Metro bundle that reaches
// `react-dom` ends up with two Reacts and dies before `AppRegistry` sees the app.

import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { TvApp, type TvAppProps } from '#tv/app/TvApp';

const Workbench = lazy(async () => ({
  default: (await import('#tv/workbench')).Workbench,
}));

function wantsWorkbench(): boolean {
  if (typeof location === 'undefined') return false;
  const params = new URLSearchParams(location.search);
  return params.has('workbench') || params.has('shot');
}

/** Mounts into `#root`; `?workbench` (or `?shot`) renders the design workbench. */
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
