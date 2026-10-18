import { classes, styles, useStyles } from '@kromatv/ui/kit';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { FullscreenFrame } from '#web/features/playback/fullscreen-frame';
import { SCRIM_Z } from '#web/shared/ui/page';

export const Route = createFileRoute('/_app/_player')({
  component: PlayerLayout,
});

const sDefinition = styles({
  over: { position: 'fixed', inset: 0, zIndex: SCRIM_Z, bg: 'black' },
});

function PlayerLayout() {
  const s = useStyles(sDefinition);

  return (
    <div className={classes(s.over)}>
      <FullscreenFrame>
        <Outlet />
      </FullscreenFrame>
    </div>
  );
}
