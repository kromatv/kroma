// @vitest-environment jsdom

import { Box, Button, Chip, Text } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { runPlay } from './play';
import { controlsNamed, type Fiber, fiberFor, isVisible, textOf } from './play-tree';

function mount(ui: ReactNode, props: object = {}): { current: object | null } {
  const stage: { current: object | null } = { current: null };
  const scene: ReactElement = (
    <View
      {...props}
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

const rootOf = (stage: { current: object | null }): Fiber => fiberFor(stage.current) as Fiber;

afterEach(cleanup);

describe('the fiber behind a stage', () => {
  it('is nothing at all for a node React never rendered', () => {
    expect(fiberFor(null)).toBeNull();
    expect(fiberFor({})).toBeNull();
  });

  it('is found whatever else the host node carries', () => {
    const node = mount(<Text>Pilot</Text>).current as Record<string, unknown>;
    const key = Object.keys(node).find((at) => at.startsWith('__reactFiber$')) as string;
    expect(fiberFor({ id: 'stage', [key]: node[key] })).toBe(fiberFor(node));
  });

  it('is taken as handed where its root names no committed tree', () => {
    // The double-buffer check needs a root to compare against; a tree built by a
    // renderer this does not know is read as it stands rather than not at all.
    const orphan = {
      type: 'View',
      memoizedProps: null,
      child: null,
      sibling: null,
      return: null,
      alternate: { type: 'View' } as Fiber,
      stateNode: null,
    } as Fiber;
    expect(fiberFor({ _internalInstanceHandle: orphan })).toBe(orphan);
  });
});

describe('what the walker reads', () => {
  it('reads a name drawn in several runs as the one string, and answers to it', () => {
    const stage = mount(<Text>Show {'more'}</Text>);
    const root = rootOf(stage);
    expect(textOf(root)).toBe('Show more');
    expect(controlsNamed(root, 'Show more')).toHaveLength(1);
  });

  it('answers with the stage itself where the stage is the control', () => {
    const stage = mount(<Button label="Delete" onPress={() => {}} />, {
      accessibilityLabel: 'Options',
    });
    const root = rootOf(stage);
    expect(controlsNamed(root, 'Options')).toEqual([root]);
  });

  it('reads a control under an aria-hidden branch as not drawn', () => {
    const stage = mount(
      <View aria-hidden>
        <Chip label="Rename" onPress={() => {}} />
      </View>,
    );
    const root = rootOf(stage);
    const [control] = controlsNamed(root, 'Rename');
    expect(control && isVisible(control, root)).toBe(false);
  });

  it('reads a branch React Native hides from a reader the same way', () => {
    const stage = mount(
      <View importantForAccessibility="no-hide-descendants">
        <Chip label="Rename" onPress={() => {}} />
      </View>,
    );
    const root = rootOf(stage);
    const [control] = controlsNamed(root, 'Rename');
    expect(control && isVisible(control, root)).toBe(false);
  });

  it('reads a control nothing hides as drawn', () => {
    const stage = mount(
      <Box>
        <Chip label="Rename" onPress={() => {}} />
      </Box>,
    );
    const root = rootOf(stage);
    const [control] = controlsNamed(root, 'Rename');
    expect(control && isVisible(control, root)).toBe(true);
  });
});

// React Native hands a `ref` a host instance rather than a node, and keeps the
// fiber on it under a name of its own. There is no Metro resolution under this
// runner, so the instance is built around a real tree rather than rendered.
describe('a stage React Native shaped', () => {
  it('reads the fiber off the host instance', async () => {
    const stage = mount(
      <Box gap={8}>
        <Button label="Options" onPress={() => {}} />
        <Chip label="Rename" onPress={() => {}} />
      </Box>,
    );
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
