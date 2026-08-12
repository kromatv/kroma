// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { storyEntries } from './entry';
import type { KitHistory } from './history';
import { RecentChanges } from './recent-changes';
import type { WorkbenchLocation, WorkbenchRouter } from './router';
import { SourceProvider, type StorySource, useSourceLink } from './source';
import { type Story, story } from './story';

afterEach(cleanup);

const ROOT = 'packages/ui/src';
const BUTTON = `${ROOT}/components/atoms/button/button.stories.tsx`;
const TOKENS = `${ROOT}/guides/02-tokens.page.mdx`;

const day = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const HISTORY: KitHistory = {
  shallow: false,
  entries: {
    [BUTTON]: {
      created: '2026-07-27T16:35:46+02:00',
      changed: day(0),
      dirty: false,
      commits: [{ sha: '7f8d2169', date: day(0), subject: 'refactor: parts, not props' }],
    },
    [TOKENS]: {
      created: '2026-07-01T16:35:46+02:00',
      changed: day(40),
      dirty: false,
      commits: [{ sha: 'b83239d9', date: day(40), subject: 'docs: the token guide' }],
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
  pages: [{ id: 'tokens', title: 'Tokens', group: 'Guides', path: TOKENS }],
};

function Mounted({
  router,
  source = SOURCE,
}: Readonly<{ router: WorkbenchRouter; source?: StorySource }>) {
  const link = useSourceLink(source, storyEntries(STORIES), router);
  // The shell calls the router at the top of its own render; the list reads what
  // that call published.
  link.router();
  return (
    <SourceProvider binding={link.binding}>
      <RecentChanges />
    </SourceProvider>
  );
}

function show(source?: StorySource): WorkbenchLocation[] {
  const went: WorkbenchLocation[] = [];
  const router: WorkbenchRouter = () => [{}, (next) => went.push(next)] as const;
  render(onScreen(<Mounted router={router} source={source} />));
  return went;
}

describe('<RecentChanges>', () => {
  it('lists a component and an article together, newest first', () => {
    show();
    expect(screen.getByText('Button')).toBeTruthy();
    expect(screen.getByText('Tokens')).toBeTruthy();
  });

  it('groups them by how long ago they moved', () => {
    show();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
  });

  it('says what the last commit did, and when the thing was added', () => {
    show();
    expect(screen.getByText(/refactor: parts, not props/)).toBeTruthy();
    expect(screen.getByText('added 27 Jul 2026')).toBeTruthy();
  });

  it('opens a component, and an article, from the row itself', () => {
    const went = show();
    fireEvent.click(screen.getByRole('button', { name: /Button/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tokens/ }));
    expect(went).toEqual([{ story: 'button' }, { page: 'tokens' }]);
  });

  it('says why it is empty when the build was made outside a checkout', () => {
    show({ ...SOURCE, history: undefined });
    expect(screen.getByText(/outside a git checkout/)).toBeTruthy();
  });

  it('says a shallow clone is a shallow clone, rather than showing wrong dates', () => {
    show({ ...SOURCE, history: { shallow: true, entries: {} } });
    expect(screen.getByText(/shallow clone/)).toBeTruthy();
  });
});
