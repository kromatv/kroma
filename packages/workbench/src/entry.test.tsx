// @vitest-environment jsdom
//
// What a reader sees between naming a story and having it: the shell keeps the
// chrome the index already knows about, says it is busy, and swaps the component
// in when its module lands.

import { Text } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { storyEntries } from './entry';
import { indexVite } from './lazy';
import { memoryRouter } from './router';
import { story } from './story';
import type { StoryCodes } from './story-code';
import { Workbench } from './workbench';

const BUTTON = 'src/components/atoms/button/button.stories.tsx';
const CODES: StoryCodes = { [BUTTON]: { name: 'Button', group: 'Actions', scenes: [] } };

const BUTTON_STORY = story({
  name: 'Button',
  group: 'Actions',
  render: () => <Text>Press me</Text>,
});

// A module that arrives when the test says so, which is the only way to look at
// the frame between the two states.
function heldBack() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release,
    modules: {
      [BUTTON]: async () => {
        await gate;
        return { default: BUTTON_STORY };
      },
    },
  };
}

function show() {
  const held = heldBack();
  render(
    onScreen(
      <Workbench
        stories={indexVite({ modules: held.modules, codes: CODES })}
        router={memoryRouter({ story: 'button' })}
      />,
    ),
  );
  return held;
}

afterEach(cleanup);

describe('a story whose module is still on its way', () => {
  it('names it from the index, so the column is never blank', () => {
    show();
    expect(screen.getAllByText('Button').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Actions').length).toBeGreaterThan(0);
  });

  it('says what it is waiting for rather than showing an empty stage', () => {
    show();
    expect(screen.getByRole('progressbar', { name: 'Loading Button' })).toBeTruthy();
    expect(screen.queryByText('Press me')).toBeNull();
  });

  // A story has views and an inspector; both describe the module, and neither
  // has anything to describe yet.
  it('offers no views and no inspector until there is something to show', () => {
    show();
    expect(screen.queryAllByText('Preview')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Controls' })).toBeNull();
  });

  it('draws the component, and stops saying it is busy, when the module lands', async () => {
    const held = show();
    held.release();
    await waitFor(() => expect(screen.getByText('Press me')).toBeTruthy());
    expect(screen.queryByRole('progressbar', { name: 'Loading Button' })).toBeNull();
    expect(screen.getAllByText('Preview')).toHaveLength(1);
  });
});

describe('storyEntries', () => {
  it('gives a compiled story an entry that is ready from the first render', () => {
    const [entry] = storyEntries([BUTTON_STORY]);
    expect(entry?.name).toBe('Button');
    expect(entry?.ready()).toBe(BUTTON_STORY);
  });

  it('passes an index straight through, so normalising twice costs nothing', () => {
    const index = indexVite({ modules: heldBack().modules, codes: CODES });
    expect(storyEntries(index)[0]).toBe(index[0]);
  });
});
