// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleSearch, ConsoleToast } from '#web/features/admin/table-console';

const show = (ui: ReactElement) => render(<I18nProvider locale="fr">{ui}</I18nProvider>);

afterEach(cleanup);

describe('the console toast', () => {
  it('is a live region, so a result is announced and not only drawn', () => {
    show(<ConsoleToast toast={{ text: '3 titres relances', on: true }} />);

    const region = screen.getByRole('status');

    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toContain('3 titres relances');
  });

  it('leaves the reading order between notices, so the last one does not linger', () => {
    const { container } = show(<ConsoleToast toast={{ text: '3 titres relances', on: false }} />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('the console search', () => {
  it('names the button that empties it, which draws a glyph and no words', () => {
    show(<ConsoleSearch value="severance" onChange={vi.fn()} placeholder="Chercher un titre" />);

    expect(screen.getByRole('button', { name: 'Effacer' })).toBeTruthy();
  });
});
