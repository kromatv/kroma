import { useEffect, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Spinner } from '#ui/components/atoms/spinner';
import { Text } from '#ui/components/atoms/text';
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
  /** Worded under the spinner once a wait has lasted; plain loading without it. */
  reason?: 'loading' | 'buffering';
}

type WaitStage = 'hidden' | 'spinning' | 'named';

const SPIN_AFTER_MS = 200;
const NAME_AFTER_MS = 2500;
const DISC = 88;
const LABEL_GAP = 16;

function useWaitStage(waiting: boolean): WaitStage {
  const [stage, setStage] = useState<WaitStage>('hidden');
  useEffect(() => {
    setStage('hidden');
    if (!waiting) return;
    const spin = setTimeout(() => setStage('spinning'), SPIN_AFTER_MS);
    const name = setTimeout(() => setStage('named'), NAME_AFTER_MS);
    return () => {
      clearTimeout(spin);
      clearTimeout(name);
    };
  }, [waiting]);
  return stage;
}

/** What covers the picture while there is none: the failure across the stage,
 *  or the spinner, which says what it waits on once the wait has lasted.
 *  Nothing when the film is playing. */
function StageOverlay({ error, hint, waiting = false, reason }: Readonly<StageOverlayProps>) {
  const t = useT();
  const stage = useWaitStage(waiting && !error);
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
  if (stage === 'hidden') return null;
  const label = t(reason === 'buffering' ? 'player.buffering' : 'player.loading');
  return (
    <Box fill z={4} center>
      <Box w={DISC} h={DISC} radius="circle" bg="black/50" center style={s.frost}>
        <Spinner size={48} thickness={4} label={label} />
      </Box>
      {stage === 'named' ? (
        <Box absolute left={0} right={0} top="50%" align="center" style={s.below}>
          <Box radius="pill" bg="black/50" px={14} py={6} style={s.frost}>
            <Text variant="meta" color="white/90">
              {label}
            </Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

const s = styles({
  frost: backdropBlur(8),
  below: { marginTop: DISC / 2 + LABEL_GAP },
});

export type { StageOverlayProps };
export { StageOverlay };
