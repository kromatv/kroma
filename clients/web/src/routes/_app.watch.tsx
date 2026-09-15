import { createFileRoute, Outlet } from '@tanstack/react-router';
import { FullscreenFrame } from '#web/features/playback/fullscreen-frame';

export const Route = createFileRoute('/_app/watch')({
  component: WatchLayout,
});

function WatchLayout() {
  return (
    <FullscreenFrame>
      <Outlet />
    </FullscreenFrame>
  );
}
