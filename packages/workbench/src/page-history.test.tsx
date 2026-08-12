// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { KitHistory } from './history';
import type { Page } from './page';
import { withPageHistory } from './page-history';
import { memoryRouter } from './router';
import { SourceProvider, type StorySource, useSourceLink } from './source';

afterEach(cleanup);

const ROOT = 'packages/ui/src';
const TOKENS = `${ROOT}/guides/02-tokens.page.mdx`;
const LOOSE = `${ROOT}/guides/09-loose.page.mdx`;

const HISTORY: KitHistory = {
  shallow: false,
  entries: {
    [TOKENS]: {
      created: '2026-07-27T16:35:46+02:00',
      changed: '2026-08-11T16:09:48+02:00',
      dirty: true,
      commits: [
        { sha: '7f8d2169', date: '2026-08-11T16:09:48+02:00', subject: 'docs: the token guide' },
      ],
    },
  },
};

const SOURCE: StorySource = {
  repository: 'https://github.com/maxscharwath/kroma',
  commit: 'c51eb485a1b2c3d4e5f60718293a4b5c6d7e8f90',
  dirty: true,
  root: ROOT,
  history: HISTORY,
};

const pageAt = (path: string): Page => ({
  id: 'tokens',
  title: 'Tokens',
  group: 'Guides',
  path,
  content: () => <>the document itself</>,
});

function Mounted({ page, source = SOURCE }: Readonly<{ page: Page; source?: StorySource }>) {
  const link = useSourceLink(source, [], memoryRouter());
  const Document = page.content;
  return (
    <SourceProvider binding={link.binding}>
      <Document />
    </SourceProvider>
  );
}

function show(path: string, source?: StorySource) {
  const [page] = withPageHistory([pageAt(path)]);
  render(onScreen(<Mounted page={page as Page} source={source} />));
}

describe('withPageHistory', () => {
  it('leaves the document itself alone', () => {
    show(TOKENS);
    expect(screen.getByText('the document itself')).toBeTruthy();
  });

  it('says when the article was created and when it was last edited', () => {
    show(TOKENS);
    expect(screen.getByText(/Created 27 Jul 2026/)).toBeTruthy();
    expect(screen.getByText(/edited/)).toBeTruthy();
  });

  it('keeps the commits behind a button, and shows them when it is pressed', () => {
    show(TOKENS);
    expect(screen.queryByText('docs: the token guide')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByText('docs: the token guide')).toBeTruthy();
    expect(screen.getByText('Uncommitted changes')).toBeTruthy();
    expect(screen.getByText('Added 27 Jul 2026')).toBeTruthy();
  });

  it('offers the article’s own file, which is what an article is', () => {
    show(TOKENS);
    expect(screen.getByRole('button', { name: 'Source' })).toBeTruthy();
  });

  it('links the source of a page git has never seen, and offers no history', () => {
    show(LOOSE);
    expect(screen.getByRole('button', { name: 'Source' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
  });

  it('draws nothing at all where the build named neither a remote nor a history', () => {
    show(TOKENS, { repository: null, commit: null, dirty: false, root: ROOT });
    expect(screen.getByText('the document itself')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Source' })).toBeNull();
    expect(screen.queryByText(/Created/)).toBeNull();
  });
});
