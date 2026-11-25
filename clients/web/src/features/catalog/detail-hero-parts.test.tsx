// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { HeroTitle } from './detail-hero-parts.component';

afterEach(cleanup);

it('shows the original title under the title when the two differ', () => {
  render(<HeroTitle title="Spirited Away" originalTitle="千と千尋の神隠し" />);

  expect(screen.getByRole('heading', { name: 'Spirited Away' })).toBeTruthy();
  expect(screen.getByText('千と千尋の神隠し')).toBeTruthy();
});

it('shows the title alone when the original title is the same but for its case', () => {
  render(<HeroTitle title="Das Boot" originalTitle=" das boot " />);

  expect(screen.getAllByText(/das boot/i)).toHaveLength(1);
});

it('shows the title alone when there is no original title', () => {
  render(<HeroTitle title="Heat" originalTitle={null} />);

  expect(screen.getAllByText('Heat')).toHaveLength(1);
});
