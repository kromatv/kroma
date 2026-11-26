// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangSwitcher } from './lang-switcher.component';

vi.mock('#site/lib/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#site/lib/i18n')>()),
  useCanonicalPath: () => '/download',
}));

afterEach(cleanup);

function opened() {
  const { container } = render(<LangSwitcher />);
  const details = container.querySelector('details');
  if (!details) {
    throw new Error('no details');
  }
  details.open = true;
  return details;
}

describe('LangSwitcher', () => {
  it('links every language to the same page in that language', () => {
    render(<LangSwitcher />);

    const french = screen.getByRole('link', { name: /Français/ });

    expect(french.getAttribute('href')).toBe('/fr/download');
    expect(french.getAttribute('hreflang')).toBe('fr');
  });

  it('marks the language being read, named once since it is its own name', () => {
    render(<LangSwitcher />);

    const current = screen.getAllByRole('link').find((row) => row.getAttribute('aria-current'));

    expect(current?.getAttribute('lang')).toBe('en');
    expect(current?.textContent).toBe('English');
  });

  it('draws each language with its square flag, on the toggle too', () => {
    const details = opened();

    const flags = [...details.querySelectorAll('img')].map((img) => img.getAttribute('src'));

    expect(flags).toHaveLength(screen.getAllByRole('link').length + 1);
    expect(flags[0]).toContain('/US.svg');
    expect(flags.every(Boolean)).toBe(true);
  });

  it('closes on a press outside, and stays open on a press inside', () => {
    const details = opened();

    fireEvent.pointerDown(screen.getByRole('link', { name: /Français/ }));

    expect(details.open).toBe(true);

    fireEvent.pointerDown(document.body);

    expect(details.open).toBe(false);
  });

  it('closes on Escape and gives the focus back to the toggle', () => {
    const details = opened();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(details.querySelector('summary'));
  });

  it('ignores other keys, and Escape once it is closed', () => {
    const details = opened();

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(details.open).toBe(true);

    details.open = false;
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.activeElement).toBe(document.body);
  });
});
