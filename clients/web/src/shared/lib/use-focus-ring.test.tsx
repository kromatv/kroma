// @vitest-environment jsdom

import { activeTheme } from '@kroma/ui/kit';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { CSSProperties } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusRing } from '#web/shared/lib/use-focus-ring';

afterEach(cleanup);

const REST: CSSProperties = { borderRadius: 4, textDecoration: 'underline' };

function Link({ token }: Readonly<{ token?: 'focus' | 'focusInset' }>) {
  const focus = useFocusRing(REST, token);
  return (
    <a href="/x" {...focus.bind} style={focus.style}>
      Lien
    </a>
  );
}

describe('useFocusRing', () => {
  it('leaves an element unringed until it takes focus', () => {
    render(<Link />);

    const link = screen.getByText('Lien');
    expect(link.style.outlineStyle).toBe('');
    expect(link.style.borderRadius).toBe('4px');
  });

  it('paints the kit ring on focus and takes it back on blur', () => {
    render(<Link />);
    const link = screen.getByText('Lien');

    act(() => link.focus());

    const ring = activeTheme().ring.focus;
    expect(link.style.outlineStyle).toBe('solid');
    expect(link.style.outlineOffset).toBe(`${ring.outlineOffset}px`);
    expect(link.style.textDecoration).toBe('underline');

    act(() => link.blur());

    expect(link.style.outlineStyle).toBe('');
  });

  it('paints the token it was named rather than the standoff default', () => {
    render(<Link token="focusInset" />);
    const link = screen.getByText('Lien');

    act(() => link.focus());

    expect(link.style.outlineOffset).toBe(`${activeTheme().ring.focusInset.outlineOffset}px`);
  });
});
