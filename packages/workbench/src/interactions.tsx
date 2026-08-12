// The interactions panel: a story's play function as it runs, one row per step.

import { Box, Chip, Icon, type IconName, Spinner, styles, Text } from '@kroma/ui/kit';
import type { ColorToken } from '@kroma/ui/tokens';
import { RULE } from './chrome';
import { MONO } from './code';
import type { PlayStatus, PlayStep } from './play-types';

interface StatusLook {
  glyph: IconName;
  ink: ColorToken;
  label: string;
  emptyNote: string;
}

const LOOK: Record<PlayStatus, StatusLook> = {
  pending: {
    glyph: 'circle-dotted',
    ink: 'textDim',
    label: 'Waiting',
    emptyNote: 'Nothing has run yet.',
  },
  running: { glyph: 'circle-dotted', ink: 'accent', label: 'Running', emptyNote: 'Running…' },
  passed: {
    glyph: 'check',
    ink: 'success',
    label: 'Passed',
    emptyNote: 'This play recorded no steps. Wrap the script in step() to see it here.',
  },
  failed: { glyph: 'x', ink: 'danger', label: 'Failed', emptyNote: '' },
};

const INDENT = 16;
const GUTTER = 25;

function StepRow({ step, last }: Readonly<{ step: PlayStep; last: boolean }>) {
  const look = LOOK[step.status];
  return (
    <Box gap={5} py={9} pl={step.depth * INDENT} style={last ? undefined : RULE}>
      <Box row align="center" gap={9}>
        <Box w={16} h={16} center shrink={0}>
          {step.status === 'running' ? (
            <Spinner size={13} color="accent" />
          ) : (
            <Icon name={look.glyph} size={14} color={look.ink} />
          )}
        </Box>
        <Text
          variant="meta"
          color={step.status === 'pending' ? 'textDim' : 'text'}
          style={s.label}
          lines={2}
        >
          {step.label}
        </Text>
      </Box>
      {step.error ? <Failure message={step.error} indent={step.depth * INDENT + GUTTER} /> : null}
    </Box>
  );
}

function Failure({ message, indent }: Readonly<{ message: string; indent: number }>) {
  return (
    <Box ml={indent} px={10} py={8} radius="md" bg="surface2">
      <Text variant="meta" color="danger" style={s.message}>
        {message}
      </Text>
    </Box>
  );
}

interface InteractionsProps {
  steps: readonly PlayStep[];
  status: PlayStatus;
  /** The failure no step claimed: a throw between steps, or a play with none. */
  error?: string;
  onReplay: () => void;
}

/** The transcript of the run on the stage, live. */
function Interactions({ steps, status, error, onReplay }: Readonly<InteractionsProps>) {
  return (
    <Box gap={14}>
      <Box row align="center" between gap={12}>
        <Box row align="center" gap={8}>
          <Text variant="overline" color="accent">
            Interactions
          </Text>
          <Text variant="meta" color={LOOK[status].ink} style={s.status}>
            {LOOK[status].label}
          </Text>
        </Box>
        <Chip
          variant="surface"
          icon="repeat"
          label="Replay"
          onPress={onReplay}
          disabled={status === 'running'}
        />
      </Box>
      {steps.length === 0 && !error && LOOK[status].emptyNote ? (
        <Text variant="meta" color="textDim">
          {LOOK[status].emptyNote}
        </Text>
      ) : null}
      <Box>
        {steps.map((step, at) => (
          <StepRow key={step.id} step={step} last={at === steps.length - 1 && !error} />
        ))}
      </Box>
      {error ? <Failure message={error} indent={0} /> : null}
    </Box>
  );
}

const s = styles({
  label: { fontSize: 12.5, fontWeight: '600', shrink: 1 },
  message: { fontFamily: MONO, fontSize: 11.5 },
  status: { fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '700' },
});

export type { InteractionsProps };
export { Interactions };
