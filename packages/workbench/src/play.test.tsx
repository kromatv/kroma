// @vitest-environment jsdom

import { Box, Button, Chip, Field, Focusable, Text } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { render } from '@testing-library/react';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { runPlay } from './play';
import type { PlayContext, PlayFunction, PlayStep, PlayTranscript } from './play-types';

function Episode({ onDelete }: Readonly<{ onDelete?: () => void }>) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Pilot');
  return (
    <Box gap={8}>
      <Button label="Options" onPress={() => setOpen(true)} />
      <Button label="Delete" disabled onPress={onDelete} />
      <Focusable onPress={() => setOpen(true)}>
        <Text>Show more</Text>
      </Focusable>
      {open ? (
        <Box gap={8}>
          <Chip label="Rename" onPress={() => setOpen(false)} />
          <Field.Root label="Title" value={title} onValueChange={setTitle} />
        </Box>
      ) : null}
    </Box>
  );
}

function Late() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const soon = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(soon);
  }, []);
  return ready ? <Chip label="Ready" onPress={() => {}} /> : null;
}

function mount(ui: ReactNode): { current: object | null } {
  const stage: { current: object | null } = { current: null };
  const scene: ReactElement = (
    <View
      ref={(node) => {
        stage.current = node as object | null;
      }}
    >
      {ui}
    </View>
  );
  render(onScreen(scene));
  return stage;
}

async function play(ui: ReactNode, script: PlayFunction): Promise<PlayTranscript> {
  const stage = mount(ui);
  return runPlay({ play: script, stage: stage.current as object, timeout: 120 });
}

const shape = (steps: readonly PlayStep[]) =>
  steps.map((step) => `${'  '.repeat(step.depth)}${step.label}: ${step.status}`);

describe('a passing play', () => {
  it('presses a control by its accessible name and sees what it opened', async () => {
    const result = await play(<Episode />, async ({ press, expect: want, step }) => {
      await step('opens the menu', async () => {
        await press('Options');
        await want('Rename').toBeVisible();
      });
    });
    expect(result.status).toBe('passed');
    expect(shape(result.steps)).toEqual(['opens the menu: passed']);
  });

  it('presses a control that only draws its name', async () => {
    const result = await play(<Episode />, async ({ press, expect: want }) => {
      await press('Show more');
      await want('Rename').toBeVisible();
    });
    expect(result.status).toBe('passed');
  });

  it('sets an entry by its label and reads the value back', async () => {
    const result = await play(<Episode />, async ({ press, type, expect: want, step }) => {
      await step('renames the episode', async () => {
        await press('Options');
        await type('Title', 'Cold open');
        await want('Title').toHaveText('Cold open');
      });
    });
    expect(result.status).toBe('passed');
  });

  it('records a nested step under its parent', async () => {
    const result = await play(<Episode />, async ({ press, step }) => {
      await step('opens the menu', async () => {
        await step('presses options', () => press('Options'));
      });
    });
    expect(shape(result.steps)).toEqual(['opens the menu: passed', '  presses options: passed']);
  });

  it('waits for a control that arrives after a delay', async () => {
    const result = await play(<Late />, ({ expect: want }) => want('Ready').toBeVisible());
    expect(result.status).toBe('passed');
  });

  it('passes a negated matcher for something never rendered', async () => {
    const result = await play(<Episode />, async ({ expect: want }) => {
      await want('Rename').not.toBeVisible();
      await want('Options').not.toHaveText('Delete');
    });
    expect(result.status).toBe('passed');
  });

  it('reports each step as it starts, before the run is over', async () => {
    const stage = mount(<Episode />);
    const seen: string[][] = [];
    await runPlay({
      stage: stage.current as object,
      timeout: 120,
      onProgress: (transcript) => seen.push(shape(transcript.steps)),
      play: async ({ press, step }) => {
        await step('first', () => press('Options'));
        await step('second', () => press('Rename'));
      },
    });
    expect(seen).toContainEqual(['first: running']);
    expect(seen).toContainEqual(['first: passed', 'second: running']);
    expect(seen.at(-1)).toEqual(['first: passed', 'second: passed']);
  });
});

describe('a failing play', () => {
  const failure = async (script: PlayFunction) => {
    const result = await play(<Episode />, script);
    expect(result.status).toBe('failed');
    return result;
  };

  it('fails only the step that threw and keeps the ones before it', async () => {
    const result = await failure(async ({ press, expect: want, step }) => {
      await step('opens the menu', () => press('Options'));
      await step('finds the archive entry', () => want('Archive').toBeVisible());
      await step('never runs', () => press('Rename'));
    });
    expect(shape(result.steps)).toEqual([
      'opens the menu: passed',
      'finds the archive entry: failed',
    ]);
    expect(result.steps[1]?.error).toContain('"Archive" is not on the stage');
  });

  it('names what IS on the stage when a lookup misses', async () => {
    const result = await failure(({ press }) => press('Optoins'));
    expect(result.error).toContain('no control "Optoins"');
    expect(result.error).toContain('"Options"');
    expect(result.error).toContain('"Delete"');
  });

  it('blames the innermost step and does not repeat the message on its parent', async () => {
    const result = await failure(async ({ expect: want, step }) => {
      await step('outer', () => step('inner', () => want('Archive').toBeVisible()));
    });
    expect(shape(result.steps)).toEqual(['outer: failed', '  inner: failed']);
    expect(result.steps[1]?.error).toContain('"Archive"');
    expect(result.steps[0]?.error).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('refuses a disabled control rather than calling its handler', async () => {
    const onDelete = vi.fn();
    const stage = mount(<Episode onDelete={onDelete} />);
    const result = await runPlay({
      stage: stage.current as object,
      timeout: 120,
      play: ({ press }) => press('Delete'),
    });
    expect(result.error).toBe('"Delete" is disabled');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('refuses a name two controls answer to', async () => {
    const result = await play(
      <Box>
        <Chip label="Play" onPress={() => {}} />
        <Chip label="Play" onPress={() => {}} />
      </Box>,
      ({ press }) => press('Play'),
    );
    expect(result.error).toBe('"Play" matches 2 controls');
  });

  it('says so when a named control answers no press', async () => {
    const result = await failure(async ({ press }) => {
      await press('Options');
      await press('Title');
    });
    expect(result.error).toBe('"Title" answers no press');
  });

  it('says so when a named control takes no value', async () => {
    const result = await failure(({ type }) => type('Options', 'Cold open'));
    expect(result.error).toBe('"Options" takes no value');
  });

  it('refuses to type into a disabled control', async () => {
    const result = await failure(({ type }) => type('Delete', 'Cold open'));
    expect(result.error).toBe('"Delete" is disabled');
  });

  it('says outright when nothing on the stage is named', async () => {
    const result = await play(<Text>Just words</Text>, ({ press }) => press('Options'));
    expect(result.error).toBe('no control "Options"; nothing on the stage is named');
  });

  it('lists the first eight names and stops', async () => {
    const rows = Array.from({ length: 10 }, (_, at) => `Row ${at}`).map((label) => (
      <Chip key={label} label={label} onPress={() => {}} />
    ));
    const result = await play(<Box>{rows}</Box>, ({ press }) => press('Missing'));
    expect(result.error).toContain('"Row 7", …');
    expect(result.error).not.toContain('Row 8');
  });

  it('fails a negated matcher for something that IS there', async () => {
    const result = await failure(({ expect: want }) => want('Options').not.toBeVisible());
    expect(result.error).toBe('"Options" is visible');
  });

  it('reports the text a control does carry', async () => {
    const result = await failure(({ expect: want }) => want('Options').toHaveText('Settings'));
    expect(result.error).toBe('"Options" reads "Options", which does not contain "Settings"');
  });

  it('fails rather than hangs when the stage is not mounted', async () => {
    const result = await runPlay({
      stage: {},
      timeout: 20,
      play: ({ press }) => press('Options'),
    });
    expect(result.error).toBe('the story is not on the stage');
  });
});

// React Native hands a `ref` a host instance rather than a node, and keeps the
// fiber on it under a name of its own. There is no Metro resolution under this
// runner, so the instance is built around a real tree rather than rendered.
describe('a stage React Native shaped', () => {
  it('reads the fiber off the host instance', async () => {
    const stage = mount(<Episode />);
    const node = stage.current as Record<string, unknown>;
    const key = Object.keys(node).find((at) => at.startsWith('__reactFiber$')) as string;
    const result = await runPlay({
      stage: { _internalInstanceHandle: node[key] },
      timeout: 120,
      play: async ({ press, expect: want }) => {
        await press('Options');
        await want('Rename').toBeVisible();
      },
    });
    expect(result.status).toBe('passed');
  });
});

describe('under a test runner that owns the flush', () => {
  it('runs the same play through act', async () => {
    const flag = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    flag.IS_REACT_ACT_ENVIRONMENT = true;
    try {
      const result = await play(<Episode />, async (at: PlayContext) => {
        await at.press('Options');
        await at.expect('Rename').toBeVisible();
      });
      expect(result.status).toBe('passed');
    } finally {
      flag.IS_REACT_ACT_ENVIRONMENT = undefined;
    }
  });
});
