// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { declared, onScreen } from '#ui/testing';
import type { RowGround } from '#ui/components/molecules/list-row';
import { ChoiceList } from './choice-list.component';

afterEach(cleanup);

interface SourcesProps {
  ground?: RowGround;
  onValueChange?: (next: string) => void;
}

const IGNORE = () => {};

function Sources({ ground, onValueChange = IGNORE }: Readonly<SourcesProps>) {
  return (
    <ChoiceList.Root label="Serveur" value="plex" ground={ground} onValueChange={onValueChange}>
      <ChoiceList.Item value="plex">
        <ChoiceList.Media>
          <Text>P</Text>
        </ChoiceList.Media>
        <ChoiceList.Label>Plex</ChoiceList.Label>
        <ChoiceList.Hint>Installé</ChoiceList.Hint>
      </ChoiceList.Item>
      <ChoiceList.Item value="jellyfin">
        <ChoiceList.Media name="server" />
        <ChoiceList.Label>Jellyfin</ChoiceList.Label>
      </ChoiceList.Item>
    </ChoiceList.Root>
  );
}

function follows(earlier: Element, later: Element): boolean {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('ChoiceList', () => {
  it('is a radio group whose whole row is the choice', () => {
    const onValueChange = vi.fn();
    render(onScreen(<Sources onValueChange={onValueChange} />));

    fireEvent.click(screen.getByRole('radio', { name: 'Jellyfin' }));

    expect(screen.getByRole('radiogroup', { name: 'Serveur' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Plex' }).getAttribute('aria-checked')).toBe('true');
    expect(onValueChange).toHaveBeenCalledWith('jellyfin');
  });

  it('puts the mark of a choice before its words', () => {
    render(onScreen(<Sources />));

    expect(follows(screen.getByText('P'), screen.getByText('Plex'))).toBe(true);
  });

  it('draws a chosen card apart from the others', () => {
    render(onScreen(<Sources ground="surface" />));

    const chosen = screen.getByRole('radio', { name: 'Plex' });
    const other = screen.getByRole('radio', { name: 'Jellyfin' });

    expect(declared(chosen, 'borderTopColor')).not.toBe(declared(other, 'borderTopColor'));
  });

  it('draws a chosen row over artwork like the others', () => {
    render(onScreen(<Sources />));

    const chosen = screen.getByRole('radio', { name: 'Plex' });
    const other = screen.getByRole('radio', { name: 'Jellyfin' });

    expect(declared(chosen, 'borderTopColor')).toBe(declared(other, 'borderTopColor'));
  });

  it('gives a card two lines for its title where a row has one', () => {
    render(onScreen(<Sources ground="surface" />));

    expect(declared(screen.getByText('Plex'), 'WebkitLineClamp')).toBe('2');
  });

  it('shows the whole hint of a card', () => {
    render(onScreen(<Sources ground="surface" />));

    expect(declared(screen.getByText('Installé'), 'WebkitLineClamp')).toBeNull();
  });

  it('refuses a mark outside a choice', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(onScreen(<ChoiceList.Media name="server" />))).toThrow(
      '<ChoiceList.Media> must be used inside <ChoiceList.Root>',
    );

    vi.restoreAllMocks();
  });
});
