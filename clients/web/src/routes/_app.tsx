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
    <CastProvider client={kromaClient()} enabled>
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <Sidebar />
        <MobileTopbar />
        <Outlet />
        {/* Roots for the catalogue's imperative modals (media info, rematch,
            report), so pages open them with `await X.call(...)` and hold no
            open-state. */}
        <CatalogModalHosts />
        <CastPicker />
        <CastBar />
      </div>
    </CastProvider>
  );
}
