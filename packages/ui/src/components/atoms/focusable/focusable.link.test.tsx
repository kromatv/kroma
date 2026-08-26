// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeTheme, sv } from '#ui/core';
import { Focusable } from './focusable';

afterEach(cleanup);

const tile = sv({
  base: { bg: 'surface1', _hover: { bg: 'surface2' }, _press: { bg: 'surface3' } },
});

function Anchor({ to, onNavigate, ...host }: Readonly<Record<string, unknown>>) {
  const click = (event: RouterClick) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    (onNavigate as (() => void) | undefined)?.();
  };
  return <View {...(host as object)} {...({ href: to, onClick: click } as object)} />;
}

interface RouterClick {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  button: number;
  preventDefault: () => void;
}

const host = (label: string) => screen.getByLabelText(label);

describe('a Focusable that delegates its host to a router link', () => {
  it('renders the delegated element as a real anchor carrying the route', () => {
    render(<Focusable label="Genres" as={<Anchor to="/genres" />} />);

    expect(host('Genres').tagName).toBe('A');
    expect(host('Genres').getAttribute('href')).toBe('/genres');
  });

  it('announces as a link without a role that contradicts the anchor', () => {
    render(<Focusable label="Genres" as={<Anchor to="/genres" />} />);

    expect(host('Genres').getAttribute('role')).toBeNull();
  });

  it('leaves activation to the element, wiring no press of its own', () => {
    const onPress = vi.fn();
    const onNavigate = vi.fn();

    render(
      <Focusable
        label="Genres"
        onPress={onPress}
        as={<Anchor to="/genres" onNavigate={onNavigate} />}
      />,
    );
    fireEvent.click(host('Genres'), { button: 0 });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('paints the recipe on the delegated element', () => {
    render(<Focusable label="Genres" sv={tile} as={<Anchor to="/genres" />} />);

    expect(host('Genres').style.backgroundColor).toBe('var(--kroma-surface-1)');
  });

  it('paints hover and press on the delegated element', () => {
    render(<Focusable label="Genres" sv={tile} as={<Anchor to="/genres" />} />);

    fireEvent.pointerEnter(host('Genres'));
    expect(host('Genres').style.backgroundColor).toBe('var(--kroma-surface-2)');

    fireEvent.pointerDown(host('Genres'));
    expect(host('Genres').style.backgroundColor).toBe('var(--kroma-surface-3)');

    fireEvent.pointerUp(host('Genres'));
    fireEvent.pointerLeave(host('Genres'));
    expect(host('Genres').style.backgroundColor).toBe('var(--kroma-surface-1)');
  });

  it('rings the delegated element when the keyboard puts focus on it', () => {
    render(<Focusable label="Genres" as={<Anchor to="/genres" />} />);

    fireEvent.focus(host('Genres'));

    expect(host('Genres').style.outlineWidth).toBe(
      `${activeTheme().ring.focusLift.outlineWidth}px`,
    );

    fireEvent.blur(host('Genres'));
    expect(host('Genres').style.outlineWidth).toBe('');
  });

  it('gives the delegated element the hand a pressable control gets', () => {
    render(<Focusable label="Genres" as={<Anchor to="/genres" />} />);

    expect(host('Genres').style.cursor).toBe('pointer');
  });

  it('carries a control that says which page it is on', () => {
    render(<Focusable label="Genres" current="page" as={<Anchor to="/genres" />} />);

    expect(host('Genres').getAttribute('aria-current')).toBe('page');
  });

  it('renders no anchor at all for a disabled control', () => {
    render(<Focusable label="Genres" disabled as={<Anchor to="/genres" />} />);

    expect(host('Genres').tagName).not.toBe('A');
    expect(host('Genres').getAttribute('aria-disabled')).toBe('true');
  });

  it('hands the resolved slots to a render-prop child', () => {
    render(
      <Focusable label="Genres" sv={tile} as={<Anchor to="/genres" />}>
        {({ slots }) => <span data-testid="paint">{String(slots.root.backgroundColor)}</span>}
      </Focusable>,
    );

    expect(screen.getByTestId('paint').textContent).toBe('var(--kroma-surface-1)');
  });
});
