// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavPill, NavPillItem } from './nav-pill';

afterEach(cleanup);

function bar(props: Partial<Parameters<typeof NavPill>[0]> = {}, onPress = vi.fn()): ReactElement {
  return (
    <NavPill {...props}>
      <NavPillItem icon="home" label="Home" onPress={onPress} />
      <NavPillItem icon="search" label="Search" active onPress={onPress} />
      <NavPillItem icon="user" label="Profile" onPress={onPress} />
    </NavPill>
  );
}

describe('NavPill label policy', () => {
  it('labels every item at tv size', () => {
    render(bar({ size: 'tv' }));
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });

  it('labels only the active item at sm size', () => {
    render(bar({ size: 'sm' }));
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('an explicit policy overrides the size default', () => {
    render(bar({ size: 'sm', labels: 'all' }));
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });

  it('labels: none is the icon-only bar, including the active item', () => {
    render(bar({ size: 'tv', labels: 'none' }));
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.queryByText('Search')).toBeNull();
  });

  it('labels: active at tv size drops the inactive labels', () => {
    render(bar({ size: 'tv', labels: 'active' }));
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.queryByText('Home')).toBeNull();
  });
});

describe('NavPill items', () => {
  it('presses the item that was tapped', () => {
    const onHome = vi.fn();
    const onProfile = vi.fn();
    render(
      <NavPill size="tv">
        <NavPillItem icon="home" label="Home" onPress={onHome} />
        <NavPillItem icon="user" label="Profile" onPress={onProfile} />
      </NavPill>,
    );
    fireEvent.click(screen.getByText('Home'));
    expect(onHome).toHaveBeenCalled();
    expect(onProfile).not.toHaveBeenCalled();
  });

  it('takes a render function for the icon, handed the resolved ink', () => {
    // Typed with its parameter: `vi.fn(() => …)` infers an empty tuple, so
    // reading calls[0][0] afterwards would not typecheck.
    const icon = vi.fn((_ink: string) => <span>glyph</span>);
    render(
      <NavPill size="tv">
        <NavPillItem icon={icon} label="Custom" active onPress={vi.fn()} />
      </NavPill>,
    );
    expect(screen.getByText('glyph')).toBeTruthy();
    expect(icon).toHaveBeenCalled();
    expect(typeof icon.mock.calls[0]?.[0]).toBe('string');
  });

  it('renders a host backdrop behind the items', () => {
    render(
      <NavPill size="sm" backdrop={<span>blur</span>}>
        <NavPillItem icon="home" label="Home" active onPress={vi.fn()} />
      </NavPill>,
    );
    expect(screen.getByText('blur')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
  });

  it('still renders a disabled item, it just cannot be pressed', () => {
    const onPress = vi.fn();
    render(
      <NavPill size="tv">
        <NavPillItem icon="home" label="Home" onPress={onPress} disabled />
      </NavPill>,
    );
    expect(screen.getByText('Home')).toBeTruthy();
    fireEvent.click(screen.getByText('Home'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('survives having no active item at all', () => {
    render(
      <NavPill size="tv">
        <NavPillItem icon="home" label="Home" onPress={vi.fn()} />
        <NavPillItem icon="user" label="Profile" onPress={vi.fn()} />
      </NavPill>,
    );
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });
});
