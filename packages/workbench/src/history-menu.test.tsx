// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { KitHistory } from './history';
import { StoryHistory } from './history-menu';
import { memoryRouter } from './router';
import { SourceProvider, type StorySource, useSourceLink } from './source';
import { type Story, story } from './story';

afterEach(cleanup);

const ROOT = 'packages/ui/src';
const BUTTON = `${ROOT}/components/atoms/button/button.stories.tsx`;

const HISTORY: KitHistory = {
  shallow: false,
  entries: {
    [BUTTON]: {
      created: '2026-07-27T16:35:46+02:00',
      changed: '2026-08-11T16:09:48+02:00',
      dirty: false,
      commits: [{ sha: '7f8d2169', date: '2026-08-11T16:09:48+02:00', subject: 'refactor: parts' }],
    },
  },
};

const STORIES: readonly Story[] = [
  { ...story({ name: 'Button', group: 'Actions', render: () => null }), path: BUTTON },
];

const SOURCE: StorySource = {
  repository: 'https://github.com/maxscharwath/kroma',
  commit: 'c51eb485a1b2c3d4e5f60718293a4b5c6d7e8f90',
  dirty: false,
  root: ROOT,
  history: HISTORY,
};

function Mounted({ open, source }: Readonly<{ open: boolean; source: StorySource }>) {
  const link = useSourceLink(source, STORIES, memoryRouter({ story: 'button' }));
  link.router();
  return (
    <SourceProvider binding={link.binding}>
      <StoryHistory open={open} onOpen={() => undefined} onClose={() => undefined} />
    </SourceProvider>
  );
}

const show = (open: boolean, source: StorySource = SOURCE) =>
  render(onScreen(<Mounted open={open} source={source} />));

describe('<StoryHistory>', () => {
  it('offers the open story’s history from the toolbar', () => {
    show(false);
    expect(
      screen.getByRole('button', { name: 'When this component was written and last changed' }),
    ).toBeTruthy();
    expect(screen.queryByText('refactor: parts')).toBeNull();
  });

  it('lists the commits and where the component began, once open', () => {
    show(true);
    expect(screen.getByText('refactor: parts')).toBeTruthy();
    expect(screen.getByText(/7f8d2169/)).toBeTruthy();
    expect(screen.getByText('Added 27 Jul 2026')).toBeTruthy();
  });

  it('draws nothing where the build read no history', () => {
    show(true, { ...SOURCE, history: undefined });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
