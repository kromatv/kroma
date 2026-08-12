// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { Timeline } from './timeline';

afterEach(cleanup);

const SIZES: readonly ControlSize[] = ['sm', 'md', 'tv'];

describe('<Timeline>', () => {
  it('renders an entry from its two sugar props', () => {
    render(
      <Timeline.Root>
        <Timeline.Item title="Sous-titres generes" detail="whisper · 3 min" />
      </Timeline.Root>,
    );
    expect(screen.getByText('Sous-titres generes')).toBeTruthy();
    expect(screen.getByText('whisper · 3 min')).toBeTruthy();
  });

  it('takes children for anything the sugar has no name for', () => {
    render(
      <Timeline.Root>
        <Timeline.Item title="Echec">
          <Text>port 41310 already bound</Text>
        </Timeline.Item>
      </Timeline.Root>,
    );
    expect(screen.getByText('port 41310 already bound')).toBeTruthy();
  });

  it('makes the whole entry the control, and nothing inside it', () => {
    const onPress = vi.fn();
    render(
      <Timeline.Root>
        <Timeline.Item title="fix: the range is clamped" detail="9db893fe" onPress={onPress} />
      </Timeline.Root>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('names a pressable entry after its title, and takes a name of its own', () => {
    render(
      <Timeline.Root>
        <Timeline.Item title="Titre" onPress={() => undefined} />
        <Timeline.Item title="Autre" label="Ouvrir sur GitHub" onPress={() => undefined} />
      </Timeline.Root>,
    );
    expect(screen.getByRole('button', { name: 'Titre' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir sur GitHub' })).toBeTruthy();
  });

  it('presses nothing when the entry has no action', () => {
    render(
      <Timeline.Root>
        <Timeline.Item title="Cree le 27 juillet" tone="origin" />
      </Timeline.Root>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('grows the entries with the size it was given', () => {
    const sizes = SIZES.map((size) => {
      render(
        <Timeline.Root size={size}>
          <Timeline.Item title="Evenement" />
        </Timeline.Root>,
      );
      const at = getComputedStyle(screen.getByText('Evenement')).fontSize;
      cleanup();
      return at;
    });
    expect(new Set(sizes).size).toBe(SIZES.length);
  });

  it('refuses a part written outside its Root, rather than drawing half a rail', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Timeline.Item title="Orpheline" />)).toThrow(/Timeline.Root/);
    quiet.mockRestore();
  });
});
