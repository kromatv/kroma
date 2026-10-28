// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { onScreen as baseOnScreen, declared, wearsRing } from '#ui/testing';
import { ResumePrompt } from './resume-prompt';

const onScreen = (ui: Parameters<typeof baseOnScreen>[0]) => baseOnScreen(ui, { remote: true });

afterEach(() => vi.restoreAllMocks());

function prompt(over: Partial<React.ComponentProps<typeof ResumePrompt>> = {}) {
  const onStartOver = vi.fn();
  const onResume = vi.fn();
  const view = render(
    onScreen(
      <ResumePrompt
        at={280}
        title="Dune"
        shown
        lift={120}
        onResume={onResume}
        onStartOver={onStartOver}
        {...over}
      />,
    ),
  );
  return { ...view, onStartOver, onResume };
}

const startOver = () => screen.getByRole('button', { name: 'Restart' });
const resume = () => screen.getByRole('button', { name: 'Resume' });

describe('ResumePrompt', () => {
  it('states the time the film opened on, and the film', () => {
    prompt();

    expect(screen.getByText('Resumed at 4:40')).toBeTruthy();
    expect(screen.getByText('Dune')).toBeTruthy();
  });

  it('announces itself politely, since nothing asked for it', () => {
    const { container } = prompt();

    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it('offers keep watching and starting over, each through the caller', () => {
    const { onStartOver, onResume } = prompt();

    act(() => resume().click());
    act(() => startOver().click());

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(onResume).toHaveBeenCalledOnce();
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it('wears the kit ring on the button the remote is on, and on neither without one', () => {
    const lit = prompt({ focus: 'resume' });
    expect(wearsRing(resume())).toBe(true);
    expect(wearsRing(startOver())).toBe(false);

    lit.unmount();
    prompt();

    expect(wearsRing(resume())).toBe(false);
    expect(wearsRing(startOver())).toBe(false);
  });

  it('draws the countdown only while it is counting', () => {
    const counting = prompt({ secondsLeft: 4, total: 6 });
    expect(screen.getByText('4')).toBeTruthy();

    counting.unmount();
    prompt({ secondsLeft: null });

    expect(screen.queryByText('4')).toBeNull();
  });

  it('draws nothing at all before it is first shown', () => {
    const { container } = prompt({ shown: false });

    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });

  it('sits where the skip pill sits, clear of the transport it was lifted over', () => {
    const { container } = prompt({ lift: 240 });
    const card = container.querySelector('[aria-live="polite"]');
    const anchor = card?.parentElement?.parentElement;

    expect(declared(anchor as Element, 'bottom')).toBe('240px');
  });
});
