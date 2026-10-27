// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusScope } from '#ui/lib/focus-scope';
import { createInputTestHost } from '#ui/testing-input';
import { PosterCard } from './poster-card';
import { TINT } from './poster-card.fixtures';

vi.mock('#ui/lib/focus-tilt', () => ({
  FocusTilt: ({ active, children }: { active: boolean; children: ReactNode }) => (
    <div data-testid="tilt" data-active={String(active)}>
      {children}
    </div>
  ),
}));

const { render } = createInputTestHost();

afterEach(cleanup);

describe('PosterCard tilt', () => {
  it('follows the remote only while it holds the focus', () => {
    render(
      <FocusScope>
        <PosterCard title="Obsession" art={null} tint={TINT} />
        <PosterCard title="Dune" art={null} tint={TINT} autoFocus />
      </FocusScope>,
    );

    const [resting, focused] = screen.getAllByTestId('tilt');

    expect(resting?.dataset.active).toBe('false');
    expect(focused?.dataset.active).toBe('true');
  });
});
