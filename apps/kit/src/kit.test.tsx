// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { matches, type Story, slug } from '@kroma/workbench';
import { cleanup, fireEvent, render as renderRaw, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Kit } from './config';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

function press(...names: string[]): void {
  for (const name of names) fireEvent.click(screen.getByRole('button', { name }));
}

// "3 of 96" -> [3, 96].
function shownOf(tally: string): [number, number] {
  const [showing, held] = tally.split(' of ').map(Number);
  return [showing ?? 0, held ?? 0];
}

function commandKey(): void {
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
}

// jsdom lays nothing out, so react-native-web reads the window through the
// documentElement box it is told about here. Zero is "unmeasured", which the
// layout answers with its desk-sized default.
function windowIs(width: number, height: number): void {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: height,
  });
  fireEvent(window, new Event('resize'));
}

// jsdom keeps one URL for the whole file, and `pathRouter` mounts on it. A bare
// address now opens the first GUIDE, which carries no toolbar and no tabs, so
// everything here that inspects the story chrome has to say which story.
const at = (url: string) => history.replaceState(null, '', url);

beforeEach(() => at('/story/colors'));

afterEach(() => {
  cleanup();
  at('/');
  windowIs(0, 0);
});

describe('the kit site', () => {
  it('lists the stories as a tree, and opens the one the address names', () => {
    render(<Kit />);
    expect(screen.getAllByText('Foundations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Colors').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Expand Actions' })).toBeTruthy();
    expect(screen.getAllByText('Preview')).toHaveLength(1);
  });

  // The front door is the first guide, not an arbitrary component: a reader
  // arriving at the kit is told how to use it before being shown a part of it.
  it('opens the first guide at a bare address, with no story chrome', () => {
    at('/');
    render(<Kit />);
    expect(screen.getAllByText('Installing the kit').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Preview')).toHaveLength(0);
  });

  it('carries the config: the mark, the wordmark and the locale lens', () => {
    render(<Kit />);
    expect(screen.getAllByText('Kit').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Language: English' })).toBeTruthy();
    press('Language: English', 'Français');
    expect(screen.getByRole('button', { name: 'Language: Français' })).toBeTruthy();
  });

  it('folds and unfolds a branch', () => {
    render(<Kit />);
    expect(screen.queryByRole('button', { name: 'Button' })).toBeNull();
    press('Expand Actions');
    expect(screen.getByRole('button', { name: 'Button' })).toBeTruthy();
    press('Collapse Actions');
    expect(screen.queryByRole('button', { name: 'Button' })).toBeNull();
  });

  it('switches story when a tree leaf is pressed', () => {
    render(<Kit />);
    press('Expand Actions', 'Button');
    expect(screen.getAllByText('Button').length).toBeGreaterThan(1);
    expect(screen.getByText('Variants')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'glass' })).toBeTruthy();
  });

  it('renders one matrix row per variant group', () => {
    render(<Kit />);
    press('Expand Actions', 'Button', 'Matrix');
    expect(screen.getAllByText('primary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('danger').length).toBeGreaterThan(0);
    expect(screen.getAllByText('size').length).toBeGreaterThan(0);
  });

  it('shows the inspector as tabs, one per kind of answer', () => {
    render(<Kit />);
    press('Expand Actions', 'Button');
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
    expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();
  });

  it('says what the frame is and how big, and turns the ones that turn', () => {
    render(<Kit />);
    press('Viewport: Fit', 'Phone');
    expect(screen.getByText(/Phone.*390 × 844.*portrait/)).toBeTruthy();
    press('Turn the frame on its side');
    expect(screen.getByText(/Phone.*844 × 390.*landscape/)).toBeTruthy();
    press('Show the frame upright');
    expect(screen.getByText(/Phone.*390 × 844.*portrait/)).toBeTruthy();
  });

  it('offers no rotation where a frame has only ever had one orientation', () => {
    render(<Kit />);
    expect(screen.queryByRole('button', { name: 'Turn the frame on its side' })).toBeNull();
    press('Viewport: Fit', 'TV');
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
    expect(screen.getByRole('button', { name: 'Surface: Page' })).toBeTruthy();
  });

  it('gives the canvas the whole window, and gives it back', () => {
    render(<Kit />);
    expect(screen.getByRole('button', { name: 'Collapse Foundations' })).toBeTruthy();
    press('Give the canvas the whole window');
    expect(screen.queryByRole('button', { name: 'Collapse Foundations' })).toBeNull();
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
    // Counted rather than named: articles are searched too, so a new guide
    // whose prose says "prog" changes the tally without changing the point,
    // which is that the query narrows the list.
    const [showing, held] = shownOf(screen.getByText(/^\d+ of \d+$/).textContent ?? '');
    expect(showing).toBeGreaterThanOrEqual(2);
    expect(showing).toBeLessThan(held);
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
    expect(screen.getAllByText('Progress').length).toBeGreaterThan(1);
  });

  it('walks the results with the arrow keys and wraps', () => {
    render(<Kit />);
    commandKey();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'prog' },
    });
    // One press per result returns the cursor to the row it started on, whatever
    // the query matched. Articles are searched too, so pressing a fixed number of
    // times would land somewhere else the moment a guide mentions the word.
    const [showing] = shownOf(screen.getByText(/^\d+ of \d+$/).textContent ?? '');
    for (let step = 0; step < showing; step += 1) fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(screen.queryByLabelText('Search the component list')).toBeNull();
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

describe('the canvas', () => {
  it('applies a control to the story and to the snippet, and puts it back', () => {
    const { container } = render(<Kit />);
    press('Expand Actions', 'Button', 'Show code');
    expect(container.textContent).not.toContain('variant="glass"');

    press('glass');
    expect(container.textContent).toContain('variant="glass"');

    press('Reset');
    expect(container.textContent).not.toContain('variant="glass"');
  });

  it('opens a demo with its source already showing', () => {
    render(<Kit />);
    press('Expand Actions', 'Button', 'Destructive pair');
    // A worked example is read with its code, unlike a preview whose code is a
    // one-line snippet.
    expect(screen.getByRole('button', { name: 'Hide code' })).toBeTruthy();
    press('Hide code');
    expect(screen.getByRole('button', { name: 'Show code' })).toBeTruthy();
  });

  it('repaints in the theme that was picked', () => {
    render(<Kit />);
    expect(screen.getByRole('button', { name: 'Theme: KROMA' })).toBeTruthy();
    press('Theme: KROMA', 'Ocean');
    expect(screen.getByRole('button', { name: 'Theme: Ocean' })).toBeTruthy();
  });
});

describe('a phone-sized window', () => {
  const closers = () => screen.getAllByRole('button', { name: 'Close component list' });

  it('moves the component list into a drawer, shut from either side of it', () => {
    render(<Kit />);
    windowIs(500, 800);
    expect(screen.queryByRole('button', { name: 'Collapse Foundations' })).toBeNull();

    press('Browse components');
    expect(screen.getByRole('button', { name: 'Collapse Foundations' })).toBeTruthy();
    fireEvent.click(closers()[0] as HTMLElement);
    expect(screen.queryByRole('button', { name: 'Collapse Foundations' })).toBeNull();

    // The sliver of canvas beside the drawer is the other way out.
    press('Browse components');
    fireEvent.click(closers()[1] as HTMLElement);
    expect(screen.queryByRole('button', { name: 'Collapse Foundations' })).toBeNull();
  });
});

// `?shot` is what the screenshot runner opens: the story alone on the page,
// with nothing of the workbench around it.
describe('a screenshot', () => {
  it('draws the story on its own, with no chrome', () => {
    history.replaceState(null, '', '/story/button?shot');
    render(<Kit />);

    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Search components' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
  });

  it('answers with the story ids when no story is named', () => {
    history.replaceState(null, '', '/?shot');
    render(<Kit />);

    const ids = screen.getByText(/^KROMA_STORY_IDS:/).textContent ?? '';
    expect(ids.slice('KROMA_STORY_IDS:'.length).split(',')).toContain('button');
  });
});

describe('routing', () => {
  it('puts the open story on a real path, with no query string', () => {
    render(<Kit />);
    press('Expand Actions', 'Button');
    expect(location.pathname).toBe('/story/button');
    expect(location.search).toBe('');
    press('Matrix');
    expect(location.pathname).toBe('/story/button/matrix');
  });

  it('spells a scene with a dash, because a path is something people type', () => {
    render(<Kit />);
    press('Expand Media', 'PosterCard');
    press('A shelf');
    expect(location.pathname).toMatch(/^\/story\/poster-card\/scene-\d+$/);
  });

  it('opens on the story the path names', () => {
    history.replaceState(null, '', '/story/chip/matrix');
    render(<Kit />);
    expect(screen.getAllByText('Chip').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Collapse Actions' })).toBeTruthy();
  });

  it('follows the browser Back button', async () => {
    render(<Kit />);
    press('Expand Actions', 'Button');
    expect(location.pathname).toBe('/story/button');
    press('Chip');
    expect(location.pathname).toBe('/story/chip');

    history.back();
    // jsdom pops the entry on a later task, so the assertion has to wait for it
    // rather than read the URL back in the same tick.
    await waitFor(() => expect(location.pathname).toBe('/story/button'));
    expect(screen.getAllByText('Button').length).toBeGreaterThan(0);
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
