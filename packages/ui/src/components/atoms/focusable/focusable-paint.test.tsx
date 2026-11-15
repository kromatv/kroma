// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { StyleSheet } from 'react-native';
import { describe, expect, it } from 'vitest';
import { sv } from '#ui/core';
import { useFocusablePaint } from './focusable-paint';

const filled = sv({
  slots: {
    root: { bg: 'accent', borderWidth: 1, _press: { bg: 'accentPress', borderWidth: 2 } },
  },
});

function pressedOver(style: object | object[] | undefined) {
  const { result } = renderHook(() =>
    useFocusablePaint({
      recipe: filled,
      vars: {},
      states: undefined,
      style,
      hovered: false,
      focusVisible: false,
      disabled: false,
      inert: false,
      canPress: true,
      actionable: true,
    }),
  );
  return StyleSheet.flatten(result.current.paintedPressed) ?? {};
}

describe('what a press paints over the style a caller gave', () => {
  it('repaints the fill of a control whose caller chose none', () => {
    const pressed = pressedOver(undefined);

    expect(Object.keys(pressed).sort()).toEqual(['backgroundColor', 'borderWidth']);
  });

  it('leaves a fill the caller chose and still paints the rest of the press', () => {
    const pressed = pressedOver({ backgroundColor: '#131314' });

    expect(Object.keys(pressed)).toEqual(['borderWidth']);
  });

  it('finds what the caller chose inside a list of styles', () => {
    const pressed = pressedOver([{ borderWidth: 1 }, [{ backgroundColor: '#131314' }]]);

    expect(Object.keys(pressed)).toEqual([]);
  });
});
