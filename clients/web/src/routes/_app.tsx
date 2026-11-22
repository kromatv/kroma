import { CastProvider } from '@kromatv/ui';
import { Box, classes, styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { CatalogModalHosts } from '#web/features/catalog/modal-hosts.component';
import { MobileTopbar, Sidebar } from '#web/features/catalog/sidebar.component';
import { useNotificationStream } from '#web/features/notifications/use-notifications';
import { CastBar } from '#web/features/playback/cast/cast-bar.component';
import { ResumeSetup } from '#web/features/setup/resume-setup.component';
import { isAuthed } from '#web/shared/lib/api';
import { deviceInfo } from '#web/shared/lib/device';
import { useRequireAuth } from '#web/shared/lib/require-auth.hook';
import { useKidsRoutes } from '#web/shared/lib/use-kids-routes.hook';
import { hasRail, RAIL_WIDTH, railInset } from '#web/shared/lib/rail';
import { tvReach } from '#web/shared/lib/tv-reach';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { CastPicker } from '#web/shared/ui/cast-picker.component';
import { DirectOffer } from '#web/shared/ui/direct-offer.component';
import { CAST_PICKER_Z } from '#web/shared/ui/page';

export const Route = createFileRoute('/_app')({
  // Without this the loaders race the boot exchange and 401-then-retry every
  // request on each reload.
  beforeLoad: async ({ context: { runtime: webRuntime } }) => {
    if (isAuthed()) {
      await webRuntime.ensureSession();
    }
  },
  loader: ({ context: { runtime: webRuntime, queryClient } }) => {
    if (isAuthed()) {
      void queryClient.prefetchQuery(webRuntime.queries.userQueries.notifications());
    }
  },
  component: AppLayout,
});

const BROWSER_LABEL =
  typeof navigator === 'undefined' ? 'Web' : deviceInfo(navigator.userAgent, 'Web').label;

// A plain element, not a `Box`: a `View` carries `position: relative` and
// `z-index: 0`, and as a flex item that makes this column a stacking context,
// so the player fixed inside it could never rise above the phone top bar, and
// its root would size "fullscreen" to the content beside the rail.
const sDefinition = styles({
  column: { display: 'flex', flexDirection: 'column', flexGrow: 1, flexBasis: 0, minWidth: 0 },
});

function AppLayout() {
  const webRuntime = useWebRuntime();

  const s = useStyles(sDefinition);

  const { ready, authed } = useRequireAuth();
  useKidsRoutes();
  const step = useBreakpoint();
  const wide = hasRail(step);
  useNotificationStream();
  if (!(ready && authed)) {
    return null;
  }
  return (
    <CastProvider client={webRuntime.client} enabled deviceName={BROWSER_LABEL} reach={tvReach}>
      <Box row={wide} minH="100%">
        {wide ? (
          <Box w={RAIL_WIDTH} shrink={0}>
            <Sidebar />
          </Box>
        ) : (
          <MobileTopbar />
        )}
        <div className={classes(s.column)}>
          <Outlet />
        </div>
        <CatalogModalHosts />
        <CastBar inset={railInset(step)} />
        <DirectOffer />
        <ResumeSetup />
      </Box>
      <Box z={CAST_PICKER_Z}>
        <CastPicker />
      </Box>
    </CastProvider>
  );
}
