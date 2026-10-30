import { CastProvider } from '@kromatv/ui';
import { Box, classes, styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { CatalogModalHosts } from '#web/features/catalog/modal-hosts';
import { MobileTopbar, Sidebar } from '#web/features/catalog/sidebar';
import { useNotificationStream } from '#web/features/notifications/use-notifications';
import { CastBar } from '#web/features/playback/cast/cast-bar';
import { isAuthed } from '#web/shared/lib/api';
import { deviceInfo } from '#web/shared/lib/device';
import { useRequireAuth } from '#web/shared/lib/require-auth';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { CastPicker } from '#web/shared/ui/cast-picker';
import { CAST_PICKER_Z } from '#web/shared/ui/page';

export const Route = createFileRoute('/_app')({
  // Without this the loaders race the boot exchange and 401-then-retry every
  // request on each reload.
  beforeLoad: async ({ context: { runtime: webRuntime } }) => {
    if (isAuthed()) await webRuntime.ensureSession();
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

const RAIL_WIDTH = 248;

function AppLayout() {
  const webRuntime = useWebRuntime();

  const s = useStyles(sDefinition);

  const { ready, authed } = useRequireAuth();
  const step = useBreakpoint();
  const wide = step === 'lg' || step === 'tv';
  useNotificationStream();
  if (!(ready && authed)) return null;
  return (
    <CastProvider client={webRuntime.client} enabled deviceName={BROWSER_LABEL}>
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
        <CastBar />
      </Box>
      <Box z={CAST_PICKER_Z}>
        <CastPicker />
      </Box>
    </CastProvider>
  );
}
