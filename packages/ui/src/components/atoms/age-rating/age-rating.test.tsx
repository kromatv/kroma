// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { onScreen } from '#ui/testing';
import { createStyleTestHost } from '#ui/testing-style';
import { AgeRating } from './age-rating.component';

const { render } = createStyleTestHost();

afterEach(() => {
  cleanup();
});

describe('AgeRating', () => {
  it("shows the reader's own label alone and names it as a rating", () => {
    render(onScreen(<AgeRating rating={{ label: '12', country: 'FR', borrowed: false }} />));

    expect(screen.getByLabelText('Rated 12').textContent).toBe('12');
  });

  it('names the country a borrowed label comes from, on screen and aloud', () => {
    render(onScreen(<AgeRating rating={{ label: 'R', country: 'US', borrowed: true }} />));

    expect(screen.getByLabelText('Rated R (US)').textContent).toBe('RUS');
  });

  it('draws nothing for a title nobody rated', () => {
    const { container } = render(onScreen(<AgeRating rating={null} />));

    expect(container.textContent).toBe('');
  });
});
