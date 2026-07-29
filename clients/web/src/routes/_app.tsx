// The signed-in app shell: a pathless layout route that frames every
// authenticated page with the sidebar and holds a session. Its children (the
// catalogue, search, player, account, …) render into <Outlet/>. Signed-out
// visitors are redirected to /login (with a redirect back here); public routes
// (login, join) and the admin console live outside this layout.

import { CastProvider } from '@kroma/ui';
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
  // Runs before any child loader (beforeLoad resolves top-down ahead of loaders):
  // exchange the stored access token for a session bearer up front so the
  // catalogue prefetch is authorised on its first try. Without this the loaders
  // race the boot exchange and 401-then-retry every request on each reload.
  beforeLoad: async () => {
    if (isAuthed()) await ensureSession();
  },
  component: AppLayout,
});

/**
 * What the television calls this browser in its list of remotes.
 *
 * The same answer the sessions list, the passkey list and the push registration
 * give, from the one table that knows a UA (shared/lib/device) - which matters
 * here rather than being tidiness: `CriOS` and `FxiOS` are Chrome and Firefox on
 * an iPhone, and a fourth hand-rolled copy called them both Safari, so two
 * different phones drove a set under one name.
 *
 * Read once, at module scope: a User-Agent cannot change, and this is `null` on
 * the server (the client re-evaluates it on hydration, which is where the value
 * is actually sent from).
 */
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
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <Sidebar />
        <MobileTopbar />
        <Outlet />
        {/* Roots for the catalogue's imperative modals (media info, rematch,
            report), so pages open them with `await X.call(...)` and hold no
            open-state. */}
        <CatalogModalHosts />
        <CastBar />
      </div>
      {/* Outside the grid, and above the player: the player is a z-60
          full-screen surface of its own, and the picker is the one modal that
          opens from INSIDE it ("play this on a TV") - at the shared modal level
          (z-50) it mounted behind an opaque black player, which read as a cast
          button that did nothing at all. A sibling of the grid rather than a
          cell of it, so an empty wrapper is never a column. */}
      <div className="relative z-[70]">
        <CastPicker />
      </div>
    </CastProvider>
  );
}
