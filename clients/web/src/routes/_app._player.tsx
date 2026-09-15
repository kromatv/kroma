import { createFileRoute, Outlet } from '@tanstack/react-router';
import { FullscreenFrame } from '#web/features/playback/fullscreen-frame';

export const Route = createFileRoute('/_app/_player')({
  component: PlayerLayout,
});

function PlayerLayout() {
  return (
    <FullscreenFrame>
      <Outlet />
    </FullscreenFrame>
  );
}
