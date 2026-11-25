// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheLimitSelect } from './cache-limit-select.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const SIZES = ['40 Go', '80 Go'];

function limit(locale: 'en' | 'fr', value: string) {
  const onChange = vi.fn();
  render(
    <I18nProvider locale={locale}>
      <CacheLimitSelect label="Cache" value={value} sizes={SIZES} onChange={onChange} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('combobox'));
  clearPressGuard();
  return onChange;
}

function offered(): string[] {
  return screen.getAllByRole('option').map((option) => option.textContent ?? '');
}

describe('CacheLimitSelect', () => {
  it('writes each size in the units of the language on screen', () => {
    limit('en', '80 Go');

    expect(offered()).toEqual(['40 GB', '80 GB', 'Unlimited']);
  });

  it('keeps the French units French', () => {
    limit('fr', '80 Go');

    expect(offered()).toEqual(['40 Go', '80 Go', 'Illimité']);
  });

  it('stores the size the way the server reads it', () => {
    const onChange = limit('en', '80 Go');

    fireEvent.click(screen.getByRole('option', { name: '40 GB' }));

    expect(onChange).toHaveBeenCalledWith('40 Go', expect.anything());
  });

  it('reads a limit stored in another language as no limit rather than a new choice', () => {
    limit('en', 'Illimité');

    expect(offered()).toEqual(['40 GB', '80 GB', 'Unlimited']);
  });

  it('offers a stored size the list does not name', () => {
    limit('en', '1.5 Go');

    expect(offered()).toEqual(['1.5 GB', '40 GB', '80 GB', 'Unlimited']);
  });
});
