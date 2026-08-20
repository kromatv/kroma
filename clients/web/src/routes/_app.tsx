import { CastProvider } from '@kroma/ui';
import { Box } from '@kroma/ui/kit';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { GateLoading } from '#web/features/accounts/auth-gate';
import { CatalogModalHosts } from '#web/features/catalog/modal-hosts';
import { MobileTopbar, Sidebar } from '#web/features/catalog/sidebar';
import { useNotificationStream } from '#web/features/notifications/use-notifications';
import { CastBar } from '#web/features/playback/cast/cast-bar';
import { ensureSession, isAuthed, kromaClient } from '#web/shared/lib/api';
import { deviceInfo } from '#web/shared/lib/device';
import { useRequireAuth } from '#web/shared/lib/require-auth';
import { CastPicker } from '#web/shared/ui/cast-picker';

export const Route = createFileRoute('/_app')({
  // Exchange the stored access token for a session bearer before any child
  // loader runs, so the catalogue prefetch is authorised on its first try.
  // Without this the loaders race the boot exchange and 401-then-retry every
  // request on each reload.
  beforeLoad: async () => {
    if (isAuthed()) await ensureSession();
  },
  component: AppLayout,
});

const BROWSER_LABEL =
  typeof navigator === 'undefined' ? 'Web' : deviceInfo(navigator.userAgent, 'Web').label;

function AppLayout() {
  const { ready, authed } = useRequireAuth();
  useNotificationStream();
  if (!(ready && authed)) return <GateLoading />;
  return (
    <CastProvider client={kromaClient()} enabled deviceName={BROWSER_LABEL}>
      <div className="app-frame">
        <Sidebar />
        <MobileTopbar />
        <Outlet />
        <CatalogModalHosts />
        <CastBar />
      </div>
      {/* Above the player (z-60): the picker opens from INSIDE it ("play this on
          a TV"), and at the shared modal z-index it mounted behind the opaque
          player, reading as a cast button that did nothing. */}
      <Box z={70}>
        <CastPicker />
      </Box>
    </CastProvider>
  );
}
