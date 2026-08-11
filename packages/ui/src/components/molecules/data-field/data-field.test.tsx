// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ControlSize } from '#ui/lib/field-shell';
import { DataField } from './data-field';

afterEach(cleanup);

const SIZES: readonly ControlSize[] = ['sm', 'md', 'tv'];

describe('<DataField>', () => {
  it('renders the pair from one line', () => {
    render(<DataField.Root label="Duree" value="2 h 04" />);
    expect(screen.getByText('Duree')).toBeTruthy();
    expect(screen.getByText('2 h 04')).toBeTruthy();
  });

  it('writes from its parts exactly what the sugar writes', () => {
    const sugar = render(<DataField.Root label="Duree" value="2 h 04" />).container.innerHTML;
    cleanup();
    const parts = render(
      <DataField.Root>
        <DataField.Label>Duree</DataField.Label>
        <DataField.Value>2 h 04</DataField.Value>
      </DataField.Root>,
    ).container.innerHTML;
    expect(parts).toBe(sugar);
  });

  it('sets the label as an overline at every size, and never as the value', () => {
    for (const size of SIZES) {
      render(<DataField.Root size={size} label="Duree" value="2 h 04" />);
      const label = getComputedStyle(screen.getByText('Duree'));
      const value = getComputedStyle(screen.getByText('2 h 04'));
      expect(label.textTransform).toBe('uppercase');
      expect(value.textTransform).not.toBe('uppercase');
      expect(Number.parseFloat(label.fontSize)).toBeLessThan(Number.parseFloat(value.fontSize));
      cleanup();
    }
  });

  it('grows the pair with the size it was given', () => {
    const sizes = SIZES.map((size) => {
      render(<DataField.Root size={size} label="Duree" value="2 h 04" />);
      const at = getComputedStyle(screen.getByText('2 h 04')).fontSize;
      cleanup();
      return at;
    });
    expect(new Set(sizes).size).toBe(SIZES.length);
  });

  it('clamps a value only when asked', () => {
    render(<DataField.Root label="Chemin" value="/Volumes/video/films" />);
    expect(getComputedStyle(screen.getByText('/Volumes/video/films')).textOverflow).not.toBe(
      'ellipsis',
    );
    cleanup();
    render(
      <DataField.Root label="Chemin">
        <DataField.Value lines={1}>/Volumes/video/films</DataField.Value>
      </DataField.Root>,
    );
    expect(getComputedStyle(screen.getByText('/Volumes/video/films')).textOverflow).toBe(
      'ellipsis',
    );
  });

  it('refuses a part used outside the Root, rather than rendering something wrong', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<DataField.Value>2 h 04</DataField.Value>)).toThrow(/DataField.Value/);
    quiet.mockRestore();
  });
});
