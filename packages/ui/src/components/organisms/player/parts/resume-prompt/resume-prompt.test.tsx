// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { onScreen as baseOnScreen, declared, wearsRing } from '#ui/testing';
import { ResumePrompt } from './resume-prompt';

const onScreen = (ui: Parameters<typeof baseOnScreen>[0]) => baseOnScreen(ui, { remote: true });

afterEach(() => vi.restoreAllMocks());

function prompt(over: Partial<React.ComponentProps<typeof ResumePrompt>> = {}) {
  const onStartOver = vi.fn();
  const view = render(
    onScreen(<ResumePrompt at={280} shown lift={120} onStartOver={onStartOver} {...over} />),
  );
  return { ...view, onStartOver };
}

const startOver = () => screen.getByRole('button', { name: 'Restart' });

describe('ResumePrompt', () => {
  it('states the time the film opened on rather than telling the viewer to resume', () => {
    prompt();

    expect(screen.getByText('Resumed at 4:40')).toBeTruthy();
  });

  it('announces itself politely, since nothing asked for it', () => {
    const { container } = prompt();

    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it('offers exactly one control, and starting over runs through the caller', () => {
    const { onStartOver } = prompt();

    act(() => startOver().click());

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it('wears the kit ring when the player says it is focused, and nothing when it is not', () => {
    const lit = prompt({ focused: true });
    expect(wearsRing(startOver())).toBe(true);

    lit.unmount();
    prompt();

    expect(wearsRing(startOver())).toBe(false);
  });

  it('shows how long it has left only while it is counting', () => {
    const counting = prompt({ secondsLeft: 4, total: 6 });
    expect(counting.container.querySelector('[role="progressbar"]')).toBeTruthy();

    counting.unmount();
    const kept = prompt({ secondsLeft: null });

    expect(kept.container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('draws nothing at all before it is first shown', () => {
    const { container } = prompt({ shown: false });

    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });

  it('sits where the skip pill sits, clear of the transport it was lifted over', () => {
    const { container } = prompt({ lift: 240 });
    const plate = container.querySelector('[aria-live="polite"]')?.parentElement?.parentElement;

    expect(declared(plate as Element, 'bottom')).toBe('240px');
  });
});
