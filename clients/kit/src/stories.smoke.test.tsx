// @vitest-environment jsdom
//
// Every story, every scene, every demo, actually rendered.
//
// The workbench's own test covers the shell; this covers the CONTENT, which is
// where breakage actually happens: a story is the only consumer of some props,
// a demo is real code with real hooks, and neither is exercised by anything
// else in the suite. A story that throws used to be discoverable only by
// clicking through 32 components in a browser.

import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { STORIES } from './stories';

/** A story's `render` is typed as ReactNode (it may legitimately return a
 * string or a fragment), while Testing Library wants an element. */
const render = (ui: ReactNode) => renderRaw(onScreen(ui as ReactElement));

afterEach(cleanup);

describe('every story renders', () => {
  for (const story of STORIES) {
    it(`${story.group} / ${story.name}: preview and matrix`, () => {
      expect(() => render(story.render(story.args))).not.toThrow();
    });

    for (const scene of story.scenes) {
      it(`${story.group} / ${story.name}: scene "${scene.name}"`, () => {
        expect(() => render(scene.render(story.args))).not.toThrow();
      });
    }

    for (const [at, entry] of story.demos.entries()) {
      it(`${story.group} / ${story.name}: demo "${entry.name}"`, () => {
        expect(() => render(entry.render())).not.toThrow();
        // A demo that ships no source is a demo whose code panel is empty.
        expect(entry.code, `demo ${at} has no code`).toBeTruthy();
      });
    }
  }
});

describe('interactive stories respond to a press', () => {
  /** The Dialog story is the one that MUST be driven to be seen: it ships a
   * trigger precisely because a permanently open modal would eat the
   * workbench's focus. If the trigger stops opening it, the story is dead and
   * nothing else in the suite notices. */
  it('opens the Dialog story from its own trigger', () => {
    const story = STORIES.find((entry) => entry.name === 'Dialog');
    if (!story) throw new Error('the Dialog story has gone missing');
    render(story.render(story.args));

    expect(screen.queryByText(String(story.args.title))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    // The modal is now on screen, with its title and both footer actions.
    expect(screen.getByText(String(story.args.title))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();

    // Opening a modal arms the press guard (see lib/press-guard: it swallows the
    // tail of the press that opened it, for 300ms). A test clicks faster than
    // any human, so drop the guard rather than sleep through it.
    clearPressGuard();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(String(story.args.title))).toBeNull();
  });

  /** A pointer user who opens a modal must be able to get out of it. The
   * overlay fills the viewport and eats every click, so when this regresses it
   * does not merely break the dialog - it makes the entire page behind it feel
   * dead, which is exactly how it was reported. */
  it('closes a dialog when the backdrop is pressed', () => {
    const story = STORIES.find((entry) => entry.name === 'Dialog');
    if (!story) throw new Error('the Dialog story has gone missing');
    render(story.render(story.args));

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText(String(story.args.title))).toBeTruthy();

    clearPressGuard();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText(String(story.args.title))).toBeNull();
  });
});
