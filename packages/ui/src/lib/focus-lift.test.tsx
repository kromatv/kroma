// @vitest-environment jsdom
//
// The lift chain has to FALL as reliably as it rises. A container that stays
// lifted after its focus has gone paints over everything after it for the rest
// of the screen's life, and nothing on screen says why.

import { cleanup, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { FocusLiftHost, LIFTED } from '#ui/lib/focus-lift';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';

beforeAll(() => configureRemote());
afterEach(cleanup);

const lifted = () => screen.getByTestId('host').style.zIndex === '1';

// The only focusable inside the host is the one under test, so nothing inside
// can inherit the focus when it goes: whatever the navigator does next, this
// host is no longer holding anything.
function tree(withTile: boolean) {
  return (
    <FocusScope>
      <FocusLiftHost>
        {(held) => (
          <View testID="host" style={held ? LIFTED : undefined}>
            {withTile ? <Focusable label="Tile" autoFocus /> : null}
          </View>
        )}
      </FocusLiftHost>
      <Focusable label="Elsewhere" />
    </FocusScope>
  );
}

describe('the focus lift chain', () => {
  it('lifts the container that holds the focus', () => {
    render(tree(true));
    expect(lifted()).toBe(true);
  });

  it('drops the container when the focused control unmounts', () => {
    const { rerender } = render(tree(true));
    expect(lifted()).toBe(true);

    // The tile goes away while it still holds the focus: a rail whose data
    // refreshed under it, a control shed by a layout, a row that emptied.
    // Nothing delivers a blur to a component that is no longer there.
    rerender(tree(false));

    expect(lifted()).toBe(false);
  });
});
