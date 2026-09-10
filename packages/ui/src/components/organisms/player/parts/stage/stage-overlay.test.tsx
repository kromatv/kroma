// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { StageOverlay, type StageOverlayProps } from './stage-overlay';

function overlay(props: StageOverlayProps) {
  return render(
    <I18nProvider locale="en">
      <StageOverlay {...props} />
    </I18nProvider>,
  );
}

function pass(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the stage while it waits', () => {
  it('keeps the picture clear for a moment, so a seek inside the buffer does not flash', () => {
    overlay({ waiting: true });
    expect(screen.queryByRole('progressbar')).toBeNull();

    pass(250);

    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('names what it waits on once the wait has lasted', () => {
    overlay({ waiting: true, reason: 'buffering' });
    pass(250);
    expect(screen.queryByText('Buffering…')).toBeNull();

    pass(2500);

    expect(screen.getByText('Buffering…')).toBeTruthy();
  });

  it('says plain loading where the engine cannot tell why', () => {
    overlay({ waiting: true });

    pass(3000);

    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('puts the failure up instead of a spinner', () => {
    overlay({ waiting: true, error: 'The server refused this stream' });

    pass(3000);

    expect(screen.getByText('The server refused this stream')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
