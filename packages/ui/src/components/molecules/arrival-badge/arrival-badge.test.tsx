// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ArrivalBadge } from './arrival-badge';
import { arriving } from './arrival-badge.fixtures';

afterEach(cleanup);

describe('<ArrivalBadge>', () => {
  it('draws the share the source reported and none of its other figures', () => {
    render(<ArrivalBadge arrival={arriving(0.42)} />);

    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.queryByText('311 KB/s')).toBeNull();
    expect(screen.queryByText('31 / 498')).toBeNull();
  });

  it("names itself to assistive tech in the source's own words", () => {
    render(<ArrivalBadge arrival={arriving(0.42)} />);

    expect(screen.getByLabelText('Téléchargé 42%')).toBeTruthy();
  });

  it('holds the same width whether the share is one digit or three', () => {
    const { container } = render(<ArrivalBadge arrival={arriving(0.07)} />);
    const narrow = screen.getByText('7%');

    render(<ArrivalBadge arrival={arriving(1)} />);

    expect(getComputedStyle(narrow).minWidth).toBe(
      getComputedStyle(screen.getByText('100%')).minWidth,
    );
    expect(container.textContent).toBe('7%');
  });

  it('takes no pointer, because a badge is not a control', () => {
    render(<ArrivalBadge arrival={arriving(0.42)} />);

    const badge = screen.getByLabelText('Téléchargé 42%');

    expect(getComputedStyle(badge).pointerEvents).toBe('none');
  });
});
