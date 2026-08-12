// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryEntry } from './entry';
import { layoutFor } from './layout';
import type { Page } from './page';
import { Sidebar } from './sidebar';

const at = (name: string, group: string) =>
  ({ id: name.toLowerCase(), name, group, tier: 'Atoms' }) as StoryEntry;

const STORIES = [at('Colors', 'Foundations'), at('Chip', 'Actions'), at('Button', 'Actions')];

const PAGES = [
  { id: 'installing-the-kit', title: 'Installing the kit', group: 'Guides' },
  { id: 'tokens', title: 'Tokens', group: 'Guides' },
] as unknown as Page[];

afterEach(cleanup);

function show(selected: string) {
  render(
    onScreen(
      <Sidebar
        stories={STORIES}
        pages={PAGES}
        selected={selected}
        onSelect={vi.fn()}
        onOpenPage={vi.fn()}
        onSearch={vi.fn()}
        layout={layoutFor(1600, 1000)}
      />,
    ),
  );
  const open = (label: string) => screen.queryByLabelText(`Collapse ${label}`) !== null;
  return { open };
}

describe('which branch the tree opens to', () => {
  it('opens the section holding the selected component', () => {
    const tree = show('chip');
    expect(tree.open('Actions')).toBe(true);
    expect(tree.open('Foundations')).toBe(false);
  });

  // An article is selected by the same id as a story. Searching only the
  // component tree found nothing, fell through to "open the first section", and
  // left Foundations expanded behind whichever guide was actually on screen.
  it('opens the articles when an article is what is open', () => {
    const tree = show('installing-the-kit');
    expect(tree.open('Guides')).toBe(true);
    expect(tree.open('Foundations')).toBe(false);
  });

  it('still opens something when the selection matches nothing at all', () => {
    const tree = show('a-story-that-moved');
    expect(tree.open('Foundations')).toBe(true);
  });
});
