// @vitest-environment jsdom

import { Box, Button, Chip } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { Interactions } from './interactions';
import { usePlay } from './play';
import type { PlayFunction, PlayStep } from './play-types';

const step = (at: Partial<PlayStep> & { label: string }): PlayStep => ({
  id: 0,
  depth: 0,
  status: 'passed',
  ...at,
});

const replay = () => screen.getByRole('button', { name: 'Replay' });

describe('the transcript', () => {
  it('draws a row per step, nested ones included', () => {
    render(
      onScreen(
        <Interactions
          status="passed"
          onReplay={() => {}}
          steps={[
            step({ id: 0, label: 'opens the menu' }),
            step({ id: 1, label: 'presses options', depth: 1 }),
          ]}
        />,
      ),
    );
    expect(screen.getByText('opens the menu')).toBeTruthy();
    expect(screen.getByText('presses options')).toBeTruthy();
    expect(screen.getByText('Passed')).toBeTruthy();
  });

  it('prints the message of the step that threw', () => {
    render(
      onScreen(
        <Interactions
          status="failed"
          onReplay={() => {}}
          steps={[
            step({ label: 'finds the menu', status: 'failed', error: 'no control "Archive"' }),
          ]}
        />,
      ),
    );
    expect(screen.getByText('no control "Archive"')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('prints a throw no step claimed', () => {
    render(
      onScreen(
        <Interactions
          status="failed"
          steps={[]}
          error="the story is not on the stage"
          onReplay={() => {}}
        />,
      ),
    );
    expect(screen.getByText('the story is not on the stage')).toBeTruthy();
  });

  it('says a play recorded nothing rather than showing an empty list', () => {
    render(onScreen(<Interactions status="passed" steps={[]} onReplay={() => {}} />));
    expect(screen.getByText(/recorded no steps/)).toBeTruthy();
  });

  it('replays on request, and not while a run is still going', () => {
    const onReplay = vi.fn();
    const { rerender } = render(
      onScreen(<Interactions status="running" steps={[]} onReplay={onReplay} />),
    );
    fireEvent.click(replay());
    expect(onReplay).not.toHaveBeenCalled();

    rerender(onScreen(<Interactions status="passed" steps={[]} onReplay={onReplay} />));
    fireEvent.click(replay());
    expect(onReplay).toHaveBeenCalledTimes(1);
  });
});

function Menu() {
  const [open, setOpen] = useState(false);
  return (
    <Box gap={8}>
      <Button label="Options" onPress={() => setOpen(true)} />
      {open ? <Chip label="Rename" onPress={() => setOpen(false)} /> : null}
    </Box>
  );
}

function Harness({ play }: Readonly<{ play?: PlayFunction }>) {
  const runner = usePlay(play, 120);
  return (
    <Box gap={12}>
      <View ref={runner.stage}>
        <Menu />
      </View>
      <Interactions
        steps={runner.steps}
        status={runner.status}
        error={runner.error}
        onReplay={runner.replay}
      />
    </Box>
  );
}

describe('the panel over a live story', () => {
  it('runs the play on mount and shows every step passing', async () => {
    const script: PlayFunction = async ({ press, expect: want, step: group }) => {
      await group('opens the menu', async () => {
        await press('Options');
        await want('Rename').toBeVisible();
      });
    };
    render(onScreen(<Harness play={script} />));

    expect(await screen.findByText('Passed')).toBeTruthy();
    expect(screen.getByText('opens the menu')).toBeTruthy();
    expect(screen.getAllByText('Rename').length).toBeGreaterThan(0);
  });

  it('shows the failure of a play that misses', async () => {
    const script: PlayFunction = ({ step: group, expect: want }) =>
      group('finds the archive entry', () => want('Archive').toBeVisible());
    render(onScreen(<Harness play={script} />));

    expect(await screen.findByText('Failed')).toBeTruthy();
    expect(screen.getByText(/"Archive" is not on the stage/)).toBeTruthy();
  });

  it('runs the play again when Replay is pressed', async () => {
    const presses: number[] = [];
    const script: PlayFunction = ({ step: group, press }) =>
      group('presses options', async () => {
        presses.push(1);
        await press('Options');
      });
    render(onScreen(<Harness play={script} />));

    expect(await screen.findByText('Passed')).toBeTruthy();
    expect(presses).toHaveLength(1);

    fireEvent.click(replay());
    await waitFor(() => expect(presses).toHaveLength(2));
  });

  it('stays idle for a story with no play function', () => {
    render(onScreen(<Harness />));
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText('Nothing has run yet.')).toBeTruthy();
  });
});
