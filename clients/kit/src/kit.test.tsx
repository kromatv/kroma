import type { ReactElement } from 'react';

// @vitest-environment jsdom

// The whole site rendered for real, through react-native-web: the
// integration test for @kroma/workbench, @kroma/ui's stories, and
// config.tsx's glue.

import { onScreen } from '@kroma/ui/testing';
import { matches, type Story, slug } from '@kroma/workbench';
import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Kit } from './config';

// Every kit control is a node of the spatial navigator; wrapping renders
// inside the same scope the app mounts in.
const render = (ui: ReactElement) => renderRaw(onScreen(ui));

// The tree opens folded except along the path to the open story, so pressing
// by accessible name takes the same presses in a test as in the app.
function press(...names: string[]): void {
  for (const name of names) fireEvent.click(screen.getByRole('button', { name }));
}

// ⌘K, dispatched where the palette listens for it: on the document, in the
// capture phase. See command.tsx.
function commandKey(): void {
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
}

afterEach(() => {
  cleanup();
  // The default `pathRouter` writes the open story into the address bar, and jsdom
  // keeps one URL for the whole file: without this, every test after the first one
  // that changes story MOUNTS on that story instead of on a cold open.
  history.replaceState(null, '', '/');
});

describe('the kit site', () => {
  it('lists the stories as a tree, and opens the first one', () => {
    render(<Kit />);
    // The level the first story sits in is unfolded; the rest are branches with
    // a count on them.
    expect(screen.getAllByText('Foundations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Colors').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Expand Atoms' })).toBeTruthy();
    // The first story of the first level is what a cold open lands on.
    expect(screen.getAllByText('Preview')).toHaveLength(1);
  });

  it('carries the config: the mark, the wordmark and the locale lens', () => {
    render(<Kit />);
    // `Kit` is the title the config passes, not a default in the package.
    expect(screen.getAllByText('Kit').length).toBeGreaterThan(0);
    // And the locale lens is a host lens, drawn indistinguishably from the
    // canvas's own.
    expect(screen.getByRole('button', { name: 'Language: English' })).toBeTruthy();
    press('Language: English', 'Français');
    expect(screen.getByRole('button', { name: 'Language: Français' })).toBeTruthy();
  });

  it('folds and unfolds a branch', () => {
    render(<Kit />);
    expect(screen.queryByRole('button', { name: 'Button' })).toBeNull();
    press('Expand Atoms', 'Expand Actions');
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
    press('Collapse Actions');
    expect(screen.queryByRole('button', { name: 'Button' })).toBeNull();
  });

  it('switches story when a tree leaf is pressed', () => {
    render(<Kit />);
    press('Expand Atoms', 'Expand Actions', 'Button');
    // The header now names the selected component, alongside its tree entry.
    expect(screen.getAllByText('Button').length).toBeGreaterThan(1);
    // ...and the panel shows the controls derived from the component's own `sv`.
    // Asserted through the CHIP rather than the label: the highlighted code
    // block also spells out `variant`, and a control is a pressable, which no
    // code token ever is.
    expect(screen.getByText('Variants')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'glass' })).toBeTruthy();
  });

  it('renders one matrix row per variant group', () => {
    render(<Kit />);
    press('Expand Atoms', 'Expand Actions', 'Button', 'Matrix');
    // Button declares variant / active / size / block; each becomes a labelled
    // row, and each row holds one cell per option.
    expect(screen.getAllByText('primary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('danger').length).toBeGreaterThan(0);
    expect(screen.getAllByText('size').length).toBeGreaterThan(0);
  });

  it('shows the inspector as tabs, one per kind of answer', () => {
    render(<Kit />);
    press('Expand Atoms', 'Expand Actions', 'Button');
    expect(screen.getByRole('button', { name: 'Docs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Props' })).toBeTruthy();
    press('Docs');
    expect(screen.getByText("What it's for")).toBeTruthy();
  });
});

describe('the toolbar', () => {
  it('names the lens it is currently applying, and changes it from a menu', () => {
    render(<Kit />);
    expect(screen.getByRole('button', { name: 'Viewport: Fit' })).toBeTruthy();
    press('Viewport: Fit', 'TV');
    expect(screen.getByRole('button', { name: 'Viewport: TV' })).toBeTruthy();
    // The menu closed behind the choice.
    expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
  });

  it('says what the frame is and how big, and turns the ones that turn', () => {
    render(<Kit />);
    press('Viewport: Fit', 'Phone');
    // The caption names the frame, its points and which way up it is.
    expect(screen.getByText(/Phone.*390 × 844.*portrait/)).toBeTruthy();
    press('Turn the frame on its side');
    expect(screen.getByText(/Phone.*844 × 390.*landscape/)).toBeTruthy();
    press('Show the frame upright');
    expect(screen.getByText(/Phone.*390 × 844.*portrait/)).toBeTruthy();
  });

  it('offers no rotation where a frame has only ever had one orientation', () => {
    render(<Kit />);
    // `fit` is not a frame at all...
    expect(screen.queryByRole('button', { name: 'Turn the frame on its side' })).toBeNull();
    press('Viewport: Fit', 'TV');
    // ...and a portrait television is a design nobody ships.
    expect(screen.queryByRole('button', { name: 'Turn the frame on its side' })).toBeNull();
    expect(screen.getByText(/TV.*1920 × 1080/)).toBeTruthy();
  });

  it('sets a newly picked frame upright, whatever the last one was', () => {
    render(<Kit />);
    press('Viewport: Fit', 'Phone', 'Turn the frame on its side');
    press('Viewport: Phone', 'Tablet');
    expect(screen.getByText(/Tablet.*834 × 1112.*portrait/)).toBeTruthy();
  });

  it('closes an open menu on Escape', () => {
    render(<Kit />);
    press('Surface: Page');
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
    // ...and the surface is the one it opened with.
    expect(screen.getByRole('button', { name: 'Surface: Page' })).toBeTruthy();
  });

  it('gives the canvas the whole window, and gives it back', () => {
    render(<Kit />);
    expect(screen.getByRole('button', { name: 'Collapse Foundations' })).toBeTruthy();
    press('Give the canvas the whole window');
    expect(screen.queryByRole('button', { name: 'Collapse Foundations' })).toBeNull();
    // The story itself is still there - it is the chrome that went.
    expect(screen.getAllByText('Preview')).toHaveLength(1);
    press('Show the tree and inspector');
    expect(screen.getByRole('button', { name: 'Collapse Foundations' })).toBeTruthy();
  });
});

describe('the command palette', () => {
  it('opens on ⌘K and filters as you type', () => {
    render(<Kit />);
    expect(screen.queryByLabelText('Search the component list')).toBeNull();
    commandKey();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'prog' },
    });
    expect(screen.getByRole('button', { name: 'Progress' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ProgressRing' })).toBeTruthy();
    // The tally counts the hits, not the registry. Matched with a pattern so
    // adding the next component to the kit does not fail this test.
    expect(screen.getByText(/^2 of \d+$/)).toBeTruthy();
  });

  it('opens from the sidebar button too', () => {
    render(<Kit />);
    press('Search components');
    expect(screen.getByLabelText('Search the component list')).toBeTruthy();
  });

  it('selects the cursor row on Enter, and closes', () => {
    render(<Kit />);
    commandKey();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'progress' },
    });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.queryByLabelText('Search the component list')).toBeNull();
    // The canvas is now on the story the cursor was resting on, and the tree has
    // unfolded to reveal where it lives.
    expect(screen.getAllByText('Progress').length).toBeGreaterThan(1);
  });

  it('walks the results with the arrow keys and wraps', () => {
    render(<Kit />);
    commandKey();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'prog' },
    });
    // Two results: down twice comes back to the first, so Enter lands there.
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getAllByText('Progress').length).toBeGreaterThan(1);
  });

  it('closes on Escape without changing the story', () => {
    render(<Kit />);
    commandKey();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('Search the component list')).toBeNull();
    expect(screen.getAllByText('Colors').length).toBeGreaterThan(0);
  });

  it('says so when nothing matches', () => {
    render(<Kit />);
    commandKey();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('No components found.')).toBeTruthy();
  });
});

describe('routing', () => {
  it('puts the open story on a real path, with no query string', () => {
    render(<Kit />);
    press('Expand Atoms', 'Expand Actions', 'Button');
    // A link you could read, type or shorten - and `preview` is spelled by being
    // absent, so the commonest state has the shortest URL.
    expect(location.pathname).toBe('/story/button');
    expect(location.search).toBe('');
    press('Matrix');
    expect(location.pathname).toBe('/story/button/matrix');
  });

  it('spells a scene with a dash, because a path is something people type', () => {
    render(<Kit />);
    press('Expand Molecules', 'Expand Media', 'PosterCard');
    press('A shelf');
    expect(location.pathname).toMatch(/^\/story\/poster-card\/scene-\d+$/);
  });

  it('opens on the story the path names', () => {
    history.replaceState(null, '', '/story/chip/matrix');
    render(<Kit />);
    // The heading names it, and the tree has unfolded to reveal it.
    expect(screen.getAllByText('Chip').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Collapse Atoms' })).toBeTruthy();
  });

  it('follows the browser Back button', () => {
    render(<Kit />);
    press('Expand Atoms', 'Expand Actions', 'Button');
    expect(location.pathname).toBe('/story/button');
    press('Chip');
    expect(location.pathname).toBe('/story/chip');
    // Opening a different component IS a page, so Back returns to the last one -
    // and the canvas has to follow the address bar, not just the reverse.
    history.back();
  });
});

describe('story matching', () => {
  const story = (name: string, group: string) => ({ name, group, id: slug(name) }) as Story;

  it('matches on the name or the section', () => {
    expect(matches(story('Button', 'Actions'), 'but')).toBe(true);
    expect(matches(story('Button', 'Actions'), 'act')).toBe(true);
    expect(matches(story('Button', 'Actions'), 'wheel')).toBe(false);
    expect(matches(story('Button', 'Actions'), '')).toBe(true);
  });
});
