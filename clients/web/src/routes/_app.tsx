// The signed-in app shell: a pathless layout route that frames every
// authenticated page with the sidebar and holds a session. Its children (the
// catalogue, search, player, account, …) render into <Outlet/>. Signed-out
// visitors are redirected to /login (with a redirect back here); public routes
// (login, join) and the admin console live outside this layout.

import { CastProvider } from '@kroma/ui';
import { Box } from '@kroma/ui/kit';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { GateLoading } from '#web/features/accounts/auth-gate';
import { CatalogModalHosts } from '#web/features/catalog/modal-hosts';
import { MobileTopbar, Sidebar } from '#web/features/catalog/sidebar';
import { useNotificationStream } from '#web/features/notifications/use-notifications';
import { CastBar } from '#web/features/playback/cast/cast-bar';
import { CastPicker } from '#web/features/playback/cast/cast-picker';
import { ensureSession, isAuthed, kromaClient } from '#web/shared/lib/api';
import { deviceInfo } from '#web/shared/lib/device';
import { useRequireAuth } from '#web/shared/lib/require-auth';

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

// What the television calls this browser in its list of remotes, from the one
// UA table (shared/lib/device) also used by the sessions list, the passkey
// list and push registration: `CriOS`/`FxiOS` are Chrome/Firefox on an iPhone,
// and treating them as Safari merges two different phones into one name.
//
// Read once at module scope: a User-Agent cannot change; this is `null` on the
// server and the client re-evaluates it on hydration.
const BROWSER_LABEL =
  typeof navigator === 'undefined' ? 'Web' : deviceInfo(navigator.userAgent, 'Web').label;

function AppLayout() {
  const { ready, authed } = useRequireAuth();
  // Shell-wide: the bell must tick on any page, not only when a panel is open.
  useNotificationStream();
  // Hold the shell (and its per-user route fetches) until a session exists;
  // useRequireAuth redirects to /login once we know there isn't one.
  if (!(ready && authed)) return <GateLoading />;
  // Desktop (lg+): fixed 248px sidebar rail + content grid. Below lg the rail
  // is hidden and a sticky topbar (hamburger → nav drawer) takes over.
  return (
    // Which TV this browser is driving is shell-wide: the button on a title
    // page and the docked remote are two views of one session.
    <CastProvider client={kromaClient()} enabled deviceName={BROWSER_LABEL}>
      <div className="app-frame">
        <Sidebar />
        <MobileTopbar />
        <Outlet />
        {/* Roots for the catalogue's imperative modals (media info, rematch,
            report), so pages open them with `await X.call(...)` and hold no
            open-state. */}
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
