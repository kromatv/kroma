// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { EmptyState, type EmptyStateSize } from './empty-state';

afterEach(cleanup);

const SIZES: readonly EmptyStateSize[] = ['sm', 'md', 'tv'];

// react-native-web resolves styles to atomic class names, so the frame is read
// back as the set of classes the two axes can move.
const FRAME = /^r-(flex|marginTop|paddingTop|paddingBottom)-/;

function frameOf(container: HTMLElement): string {
  const root = container.firstElementChild as HTMLElement;
  return [...root.classList]
    .filter((name) => FRAME.test(name))
    .sort()
    .join(' ');
}

function glyphWidth(container: HTMLElement): string | null {
  return container.querySelector('svg')?.getAttribute('width') ?? null;
}

describe('<EmptyState>', () => {
  it('renders the whole column from its parts', () => {
    const { container } = render(
      <EmptyState.Root icon="mood-empty">
        <EmptyState.Title>Aucun resultat</EmptyState.Title>
        <EmptyState.Hint>Essayez un autre terme.</EmptyState.Hint>
        <EmptyState.Detail>GET /api/module/tv.kroma.remote/remote 502</EmptyState.Detail>
        <EmptyState.Actions>
          <Text>Reessayer</Text>
        </EmptyState.Actions>
      </EmptyState.Root>,
    );
    expect(glyphWidth(container)).toBe('26');
    expect(screen.getByText('Aucun resultat')).toBeTruthy();
    expect(screen.getByText('Essayez un autre terme.')).toBeTruthy();
    expect(screen.getByText('GET /api/module/tv.kroma.remote/remote 502')).toBeTruthy();
    expect(screen.getByText('Reessayer')).toBeTruthy();
  });

  it('draws the same mark whether it comes from the icon or from a written media', () => {
    const sugar = render(<EmptyState.Root icon="mood-empty" />).container.innerHTML;
    cleanup();
    const part = render(
      <EmptyState.Root>
        <EmptyState.Media name="mood-empty" />
      </EmptyState.Root>,
    ).container.innerHTML;
    expect(part).toBe(sugar);
  });

  it.each([
    ['sm', '24'],
    ['md', '26'],
    ['tv', '40'],
  ] as const)('hands a part the %s the Root was given', (size, width) => {
    const { container } = render(
      <EmptyState.Root size={size}>
        <EmptyState.Media name="mood-empty" />
      </EmptyState.Root>,
    );
    expect(glyphWidth(container)).toBe(width);
  });

  it('offsets an inline state by its size, and fills the same way at every size', () => {
    const inline = SIZES.map((size) =>
      frameOf(
        render(
          <EmptyState.Root size={size}>
            <EmptyState.Title>x</EmptyState.Title>
          </EmptyState.Root>,
        ).container,
      ),
    );
    cleanup();
    const filled = SIZES.map((size) =>
      frameOf(
        render(
          <EmptyState.Root size={size} layout="fill">
            <EmptyState.Title>x</EmptyState.Title>
          </EmptyState.Root>,
        ).container,
      ),
    );
    expect(new Set(inline).size).toBe(SIZES.length);
    expect(new Set(filled).size).toBe(1);
    expect(filled[0]).not.toBe(inline[1]);
  });

  it.each(SIZES)('holds a %s inline state off both edges, never only the top', (size) => {
    const { container } = render(
      <EmptyState.Root size={size}>
        <EmptyState.Title>x</EmptyState.Title>
      </EmptyState.Root>,
    );
    const frame = frameOf(container);
    expect(frame).not.toMatch(/marginTop/);
    expect(frame).toMatch(/paddingTop/);
    expect(frame).toMatch(/paddingBottom/);
  });

  it('refuses a part used outside the Root, rather than rendering something wrong', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<EmptyState.Title>Aucun resultat</EmptyState.Title>)).toThrow(
      /EmptyState.Title/,
    );
    quiet.mockRestore();
  });
});
