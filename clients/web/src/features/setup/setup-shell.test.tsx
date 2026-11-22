// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SetupStep } from '#web/features/setup/setup-steps';

vi.mock('#web/features/setup/use-wall-posters.hook', () => ({
  useWallPosters: (posters: readonly string[]) => posters,
}));
vi.mock('#web/shared/ui/poster-wall.component', () => ({ PosterWall: () => null }));

import { SetupShell } from './setup-shell.component';

afterEach(cleanup);

function show(step: SetupStep) {
  return render(
    <I18nProvider locale="en">
      <SetupShell
        step={step}
        start="fresh"
        reached={step}
        open={[step]}
        posters={[]}
        onStep={() => undefined}
        onFinishLater={() => undefined}
      >
        <p>the step</p>
      </SetupShell>
    </I18nProvider>,
  );
}

describe('the setup shell', () => {
  it('lists the steps and offers to finish later on a step the owner may skip', () => {
    show('media');

    expect(screen.getByText('the step')).toBeTruthy();
    expect(screen.getByText(/Step 4 of 7/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish later' })).toBeTruthy();
  });

  it('shows the last screen alone, with no list of steps and nothing to skip', () => {
    show('done');

    expect(screen.getByText('the step')).toBeTruthy();
    expect(screen.queryByText(/Step \d+ of \d+/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish later' })).toBeNull();
  });
});
