// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DirectionContext, useDirection } from './direction';
import { DirectionRoot } from './direction-root.component';

afterEach(cleanup);

function Probe() {
  return <span data-testid="probe">{useDirection()}</span>;
}

describe('useDirection', () => {
  it('reads left to right where nothing says otherwise', () => {
    render(<Probe />);

    expect(screen.getByTestId('probe').textContent).toBe('ltr');
  });

  it('reads the direction the nearest provider names', () => {
    render(
      <DirectionContext value="rtl">
        <Probe />
      </DirectionContext>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('rtl');
  });
});

describe('DirectionRoot', () => {
  it('runs a tree right to left for a language written that way', () => {
    render(
      <DirectionRoot locale="he">
        <Probe />
      </DirectionRoot>,
    );

    const probe = screen.getByTestId('probe');
    expect(probe.textContent).toBe('rtl');
    expect(probe.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
  });

  it('adds nothing to a tree that runs the way the one around it does', () => {
    const { container } = render(
      <DirectionRoot locale="fr">
        <Probe />
      </DirectionRoot>,
    );

    expect(container.firstElementChild).toBe(screen.getByTestId('probe'));
    expect(screen.getByTestId('probe').textContent).toBe('ltr');
  });
});
