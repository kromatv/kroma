// @vitest-environment jsdom

import { activeTheme, styles } from '@kroma/ui/kit';
import { declared } from '@kroma/ui/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusRing } from '#web/shared/lib/use-focus-ring';

afterEach(cleanup);

const s = styles({ rest: { radius: 4, textDecorationLine: 'underline' } });

function Link({ token }: Readonly<{ token?: 'focus' | 'focusInset' }>) {
  const focus = useFocusRing(s.rest, token);
  return (
    <a href="/x" {...focus.bind} className={focus.className}>
      Lien
    </a>
  );
}

describe('useFocusRing', () => {
  it('leaves an element unringed until it takes focus', () => {
    render(<Link />);

    const link = screen.getByText('Lien');
    expect(declared(link, 'outline-style')).toBeNull();
    expect(declared(link, 'border-top-left-radius')).toBe('4px');
    expect(link.getAttribute('style')).toBeNull();
  });

  it('paints the kit ring on focus and takes it back on blur', () => {
    render(<Link />);
    const link = screen.getByText('Lien');

    act(() => link.focus());

    const ring = activeTheme().ring.focus;
    expect(declared(link, 'outline-style')).toBe('solid');
    expect(declared(link, 'outline-offset')).toBe(`${ring.outlineOffset}px`);
    expect(declared(link, 'border-top-left-radius')).toBe('4px');

    act(() => link.blur());

    expect(declared(link, 'outline-style')).toBeNull();
  });

  it('paints the token it was named rather than the standoff default', () => {
    render(<Link token="focusInset" />);
    const link = screen.getByText('Lien');

    act(() => link.focus());

    expect(declared(link, 'outline-offset')).toBe(
      `${activeTheme().ring.focusInset.outlineOffset}px`,
    );
  });
});
