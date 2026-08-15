// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layout } from '#ui/testing';
import { NavPill, type NavPillRootProps } from './nav-pill';

afterEach(cleanup);

function bar(props: Partial<NavPillRootProps> = {}, onPress = vi.fn()): ReactElement {
  return (
    <NavPill.Root {...props}>
      <NavPill.Item icon="home" label="Home" onPress={onPress} />
      <NavPill.Item icon="search" label="Search" active onPress={onPress} />
      <NavPill.Item icon="user" label="Profile" onPress={onPress} />
    </NavPill.Root>
  );
}

describe('NavPill parts', () => {
  it('is a namespace of parts, not a component', () => {
    expect(typeof NavPill).toBe('object');
    expect(Object.keys(NavPill).sort()).toEqual(['Backdrop', 'Item', 'Root']);
  });

  it('refuses a part written outside a capsule', () => {
    expect(() => render(<NavPill.Item icon="home" label="Orpheline" onPress={vi.fn()} />)).toThrow(
      '<NavPill.Item> must be used inside <NavPill.Root>',
    );
  });

  it('is one focus stop per item, and none for the capsule or its backdrop', () => {
    const { container } = render(
      <NavPill.Root size="tv">
        <NavPill.Backdrop>
          <span>blur</span>
        </NavPill.Backdrop>
        <NavPill.Item icon="home" label="Home" onPress={vi.fn()} />
        <NavPill.Item icon="user" label="Profile" active onPress={vi.fn()} />
      </NavPill.Root>,
    );
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(2);
  });
});

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

  it('names an unlabelled item to assistive tech all the same', () => {
    render(bar({ size: 'tv', labels: 'none' }));
    expect(screen.getByLabelText('Home')).toBeTruthy();
  });

  it('names the strip itself, so its tabs are tabs of something', () => {
    render(bar({ label: 'Menu' }));
    const strip = screen.getByRole('tablist', { name: 'Menu' });
    expect(strip).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Search' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('NavPill items', () => {
  it('presses the item that was tapped', () => {
    const onHome = vi.fn();
    const onProfile = vi.fn();
    render(
      <NavPill.Root size="tv">
        <NavPill.Item icon="home" label="Home" onPress={onHome} />
        <NavPill.Item icon="user" label="Profile" onPress={onProfile} />
      </NavPill.Root>,
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
      <NavPill.Root size="tv">
        <NavPill.Item icon={icon} label="Custom" active onPress={vi.fn()} />
      </NavPill.Root>,
    );
    expect(screen.getByText('glyph')).toBeTruthy();
    expect(icon).toHaveBeenCalled();
    expect(typeof icon.mock.calls[0]?.[0]).toBe('string');
  });

  it('renders a backdrop part behind the items, whatever order it was written in', () => {
    const { container } = render(
      <NavPill.Root size="sm">
        <NavPill.Item icon="home" label="Home" active onPress={vi.fn()} />
        <NavPill.Backdrop>
          <span>blur</span>
        </NavPill.Backdrop>
      </NavPill.Root>,
    );
    expect(screen.getByText('blur')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(container.textContent).toBe('blurHome');
  });

  it('thins the capsule fill only when it wears a backdrop', () => {
    const fill = (node: HTMLElement) => getComputedStyle(node).backgroundColor;
    const plain = render(bar({ size: 'sm' })).container.firstElementChild as HTMLElement;
    const frosted = render(
      <NavPill.Root size="sm">
        <NavPill.Backdrop>
          <span>blur</span>
        </NavPill.Backdrop>
        <NavPill.Item icon="home" label="Home" active onPress={vi.fn()} />
      </NavPill.Root>,
    ).container.firstElementChild as HTMLElement;
    expect(fill(frosted)).not.toBe(fill(plain));
  });

  it('still renders a disabled item, it just cannot be pressed', () => {
    const onPress = vi.fn();
    render(
      <NavPill.Root size="tv">
        <NavPill.Item icon="home" label="Home" onPress={onPress} disabled />
      </NavPill.Root>,
    );
    expect(screen.getByText('Home')).toBeTruthy();
    fireEvent.click(screen.getByText('Home'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hands the lens the box the active item measured, and only that item', () => {
    const { container } = render(
      <NavPill.Root size="tv">
        <NavPill.Item icon="home" label="Home" onPress={vi.fn()} />
        <NavPill.Item icon="user" label="Profile" active onPress={vi.fn()} />
      </NavPill.Root>,
    );
    const capsule = container.firstElementChild as HTMLElement;
    const item = (name: string) => screen.getByLabelText(name);
    expect(capsule.children).toHaveLength(2);

    layout(item('Home'), { x: 8, y: 4, width: 96, height: 44 });
    expect(capsule.children).toHaveLength(2);

    layout(item('Profile'), { x: 128, y: 4, width: 120, height: 44 });
    expect(capsule.children).toHaveLength(3);
    const lens = capsule.firstElementChild as HTMLElement;
    expect(lens.style.transform).toBe('translateX(128px)');
    expect(lens.style.width).toBe('120px');
  });

  it('survives having no active item at all', () => {
    render(
      <NavPill.Root size="tv">
        <NavPill.Item icon="home" label="Home" onPress={vi.fn()} />
        <NavPill.Item icon="user" label="Profile" onPress={vi.fn()} />
      </NavPill.Root>,
    );
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });
});
