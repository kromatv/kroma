// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { color } from '#ui/core';
import { Legend } from './legend';

afterEach(cleanup);

describe('<Legend>', () => {
  it('paints each dot with the colour its entry was given', () => {
    const { container } = render(
      <Legend.Root>
        <Legend.Item color="success">Termine</Legend.Item>
        <Legend.Item color="danger">Echoue</Legend.Item>
      </Legend.Root>,
    );
    const paints = [...container.querySelectorAll('div')]
      .map((node) => getComputedStyle(node).backgroundColor)
      .filter((paint) => paint !== '' && paint !== 'rgba(0, 0, 0, 0)');
    expect(paints).toEqual([color('success'), color('danger')]);
  });

  it('names each entry from its children', () => {
    render(
      <Legend.Root>
        <Legend.Item color="success">Termine</Legend.Item>
        <Legend.Item color="danger">Echoue</Legend.Item>
      </Legend.Root>,
    );
    expect(screen.getByText('Termine')).toBeTruthy();
    expect(screen.getByText('Echoue')).toBeTruthy();
  });

  it('leaves nothing pressable: a legend reports, it does not filter', () => {
    const { container } = render(
      <Legend.Root>
        <Legend.Item color="success">Termine</Legend.Item>
      </Legend.Root>,
    );
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('wraps rather than pushing a long key off the row', () => {
    const { container } = render(
      <Legend.Root>
        <Legend.Item color="success">Termine</Legend.Item>
      </Legend.Root>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(root).flexWrap).toBe('wrap');
  });

  it('refuses an entry used outside the Root, rather than rendering something wrong', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Legend.Item color="success">Termine</Legend.Item>)).toThrow(/Legend.Item/);
    quiet.mockRestore();
  });
});
