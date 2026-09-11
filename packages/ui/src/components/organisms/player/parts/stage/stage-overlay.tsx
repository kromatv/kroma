import { useEffect, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Spinner } from '#ui/components/atoms/spinner';
import { EmptyState } from '#ui/components/molecules/empty-state';
import { styles } from '#ui/core';
import { backdropBlur } from '#ui/lib/css';
import { useT } from '#ui/services/i18n';

interface StageOverlayProps {
  /** Already-localized, and the reason the picture is not coming. Wins over
   *  `waiting`: a title that has died is not still loading. */
  error?: string | null;
  /** The line under {@link error}, where there is something to do about it. */
  hint?: string | null;
  waiting?: boolean;
  /** What the spinner tells assistive tech it waits on; plain loading without it. */
  reason?: 'loading' | 'buffering';
}

const SPIN_AFTER_MS = 200;
const DISC = 88;

function useSpinnerShown(waiting: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!waiting) return;
    const spin = setTimeout(() => setShown(true), SPIN_AFTER_MS);
    return () => clearTimeout(spin);
  }, [waiting]);
  return shown;
}

/** What covers the picture while there is none: the failure across the stage,
 *  or the spinner. Nothing when the film is playing. */
function StageOverlay({ error, hint, waiting = false, reason }: Readonly<StageOverlayProps>) {
  const t = useT();
  const shown = useSpinnerShown(waiting && !error);
  if (error) {
    return (
      <Box fill z={4} center px={64}>
        <EmptyState.Root size="tv" icon="device-tv">
          <EmptyState.Title>{error}</EmptyState.Title>
          {hint ? <EmptyState.Hint>{hint}</EmptyState.Hint> : null}
        </EmptyState.Root>
      </Box>
    );
  }
  if (!shown) return null;
  return (
    <Box fill z={4} center>
      <Box w={DISC} h={DISC} radius="circle" bg="black/50" center style={s.frost}>
        <Spinner
          size={48}
          thickness={4}
          label={t(reason === 'buffering' ? 'player.buffering' : 'player.loading')}
        />
      </Box>
    </Box>
  );
}

const s = styles({ frost: backdropBlur(8) });

export type { StageOverlayProps };
export { StageOverlay };
