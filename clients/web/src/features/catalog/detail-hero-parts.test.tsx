// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it } from 'vitest';
import { HeroFields, HeroTitle } from './detail-hero-parts.component';

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

function fields(props: ComponentProps<typeof HeroFields>) {
  return render(
    <I18nProvider locale="en">
      <HeroFields {...props} />
    </I18nProvider>,
  );
}

it('names the studios that made the title after its audio and subtitles', () => {
  fields({
    audio: 'English',
    subtitles: 'French',
    studios: ['Regency Enterprises', 'Forward Pass'],
  });

  expect(screen.getByText('Audio')).toBeTruthy();
  expect(screen.getByText('Subtitles')).toBeTruthy();
  expect(screen.getByText('Studios')).toBeTruthy();
  expect(screen.getByText('Regency Enterprises, Forward Pass')).toBeTruthy();
});

it('says studio for a title one studio made, and leaves out what is not known', () => {
  fields({ studios: ['A24'] });

  expect(screen.getByText('Studio')).toBeTruthy();
  expect(screen.getByText('A24')).toBeTruthy();
  expect(screen.queryByText('Audio')).toBeNull();
});

it('shows nothing when no field is known', () => {
  const { container } = fields({ studios: [] });

  expect(container.textContent).toBe('');
});
