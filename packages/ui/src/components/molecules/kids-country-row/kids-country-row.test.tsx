// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { KidsCountryRow } from './kids-country-row.component';

afterEach(cleanup);

describe('KidsCountryRow', () => {
  it('names the country the form shows, and opens the list when pressed', () => {
    const open = vi.fn();
    render(onScreen(<KidsCountryRow country="CH" onPress={open} />));

    fireEvent.click(screen.getByRole('button', { name: /Ratings country/ }));

    expect(screen.getByText('Switzerland')).toBeTruthy();
    expect(open).toHaveBeenCalledOnce();
  });

  it('is not drawn while the country is not known', () => {
    const { container } = render(onScreen(<KidsCountryRow country={null} onPress={vi.fn()} />));

    expect(container.textContent).toBe('');
  });
});
