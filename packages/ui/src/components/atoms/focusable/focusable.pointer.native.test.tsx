// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusRegion, FocusScope } from '#ui/lib/focus-scope';
import { Focusable } from './focusable';

afterEach(cleanup);

const face = (label: string) => screen.getByLabelText(label).firstElementChild as HTMLElement;

function pair(at: { onBlur?: () => void; onFocus?: () => void; onPress?: () => void }) {
  render(
    <FocusScope>
      <FocusRegion>
        <Focusable label="Un" autoFocus onBlur={at.onBlur} />
        <Focusable label="Deux" onFocus={at.onFocus} onPress={at.onPress} />
      </FocusRegion>
    </FocusScope>,
  );
}

describe('a tap on a control the remote is not on', () => {
  it('moves the ring before the press acts', () => {
    const order: string[] = [];
    pair({ onFocus: () => order.push('focus'), onPress: () => order.push('press') });

    fireEvent.click(face('Deux'));

    expect(order).toEqual(['focus', 'press']);
  });

  it('takes the ring off wherever the remote left it', () => {
    const onBlur = vi.fn();
    pair({ onBlur });

    fireEvent.click(face('Deux'));

    expect(onBlur).toHaveBeenCalledOnce();
  });
});
