// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionBar } from './selection-bar';

afterEach(() => {
  vi.restoreAllMocks();
});

function Bar({ count }: Readonly<{ count: number }>) {
  return (
    <SelectionBar.Root count={count} onClear={() => {}} label="Sélection">
      <SelectionBar.Clear label="Tout désélectionner" />
      <SelectionBar.Status>
        {count === 1 ? '1 titre sélectionné' : `${count} titres sélectionnés`}
      </SelectionBar.Status>
      <SelectionBar.Actions label="Autres actions">
        <SelectionBar.Item icon="radar" tone="accent" label="Suivre" onPress={() => {}} />
      </SelectionBar.Actions>
    </SelectionBar.Root>
  );
}

describe('<SelectionBar> under Metro resolution', () => {
  it('hands the status to the native screen reader each time it moves', () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = render(<Bar count={1} />);

    rerender(<Bar count={2} />);

    expect(announce.mock.calls.map(([text]) => text)).toEqual([
      '1 titre sélectionné',
      '2 titres sélectionnés',
    ]);
  });

  it('says nothing while nothing is selected', () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');

    render(<Bar count={0} />);

    expect(announce).not.toHaveBeenCalled();
  });

  it('draws the bar with no browser live region beside it', () => {
    const { container } = render(<Bar count={2} />);

    expect(screen.getByRole('group', { name: 'Sélection' })).toBeTruthy();
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});
