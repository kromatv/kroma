// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FocusTilt } from './focus-tilt';

afterEach(cleanup);

describe('focus tilt off Apple TV', () => {
  it('adds no element around the poster it is given', () => {
    const { container } = render(
      <FocusTilt active>
        <span>Dune</span>
      </FocusTilt>,
    );

    expect(screen.getByText('Dune')).toBeTruthy();
    expect(container.childElementCount).toBe(1);
    expect(container.firstElementChild?.tagName).toBe('SPAN');
  });
});
