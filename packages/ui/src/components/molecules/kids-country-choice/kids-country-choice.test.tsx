// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { KidsCountryChoice } from './kids-country-choice.component';

afterEach(cleanup);

describe('KidsCountryChoice', () => {
  it('changes the form country to the one pressed, then leaves the list', () => {
    const country = { country: 'CH', countries: ['CH', 'DE'], pick: vi.fn() };
    const left = vi.fn();
    render(onScreen(<KidsCountryChoice country={country} onPicked={left} />));

    fireEvent.click(screen.getByRole('radio', { name: 'Germany' }));

    expect(country.pick).toHaveBeenCalledWith('DE');
    expect(left).toHaveBeenCalledOnce();
  });
});
