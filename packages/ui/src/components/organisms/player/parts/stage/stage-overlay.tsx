import { Box } from '#ui/components/atoms/box';
import { Spinner } from '#ui/components/atoms/spinner';
import { EmptyState } from '#ui/components/molecules/empty-state';

interface StageOverlayProps {
  /** Already-localized, and the reason the picture is not coming. Wins over
   *  `waiting`: a title that has died is not still loading. */
  error?: string | null;
  /** The line under {@link error}, where there is something to do about it. */
  hint?: string | null;
  waiting?: boolean;
}

/** What covers the picture while there is none: the failure across the stage,
 *  or the spinner. Nothing when the film is playing. */
function StageOverlay({ error, hint, waiting }: Readonly<StageOverlayProps>) {
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
  if (waiting) {
    return (
      <Box fill z={4} center>
        <Spinner size={56} thickness={3} />
      </Box>
    );
  }
  return null;
}

export type { StageOverlayProps };
export { StageOverlay };
