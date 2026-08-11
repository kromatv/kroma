// @vitest-environment jsdom

import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { STORIES } from './stories';

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
        expect(entry.code, `demo ${at} has no code`).toBeTruthy();
      });
    }
  }
});

describe('interactive stories respond to a press', () => {
  it('opens the Dialog story from its own trigger', () => {
    const story = STORIES.find((entry) => entry.name === 'Dialog');
    if (!story) throw new Error('the Dialog story has gone missing');
    render(story.render(story.args));

    expect(screen.queryByText(String(story.args.title))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText(String(story.args.title))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();

    // Opening a modal arms the press guard for 300ms; a test clicks faster.
    clearPressGuard();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(String(story.args.title))).toBeNull();
  });

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
