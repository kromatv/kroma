// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { RING_ROOM } from '#ui/core';
import { Dialog } from './dialog';

afterEach(cleanup);

// The gap between a pinned band and the panel's content, which the two split.
const GAP = 24;

const pad = (el: Element, side: 'Top' | 'Bottom') =>
  Number.parseFloat(getComputedStyle(el)[`padding${side}` as 'paddingTop']) || 0;

const boxOf = (text: string) => {
  const node = screen.getByText(text).parentElement;
  if (!node) throw new Error(`${text} has no box`);
  return node;
};

describe("the panel's room for a focus ring", () => {
  it('keeps RING_ROOM against a pinned band, and the band gives back exactly that much', () => {
    render(
      <Dialog.Root open title="Modifier">
        <Text>Corps</Text>
        <Dialog.Footer>
          <Text>Pied</Text>
        </Dialog.Footer>
      </Dialog.Root>,
    );
    const header = boxOf('Modifier');
    const content = boxOf('Corps');
    const footer = boxOf('Pied');

    expect(pad(content, 'Top')).toBe(RING_ROOM);
    expect(pad(content, 'Bottom')).toBe(RING_ROOM);
    // What a reader sees is unchanged: the band and the panel sum to the gap.
    expect(pad(header, 'Bottom') + pad(content, 'Top')).toBe(GAP);
    expect(pad(footer, 'Top') + pad(content, 'Bottom')).toBe(GAP);
  });

  it('spends none of it on a panel whose content owns its own layout', () => {
    render(
      <Dialog.Root open title="Détail" pad={0} titleHidden>
        <Text>Corps</Text>
      </Dialog.Root>,
    );
    expect(pad(boxOf('Corps'), 'Top')).toBe(0);
  });
});
