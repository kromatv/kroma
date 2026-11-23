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

function paint(style: object | object[] | undefined, beneath?: object) {
  const { result } = renderHook(() =>
    useFocusablePaint({
      recipe: filled,
      beneath,
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
  return result.current;
}

function pressedOver(style: object | object[] | undefined) {
  return StyleSheet.flatten(paint(style).paintedPressed) ?? {};
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

describe('the corner a container hands its members', () => {
  it('shapes a control that states no corner of its own', () => {
    const { dressed } = paint(undefined, { borderRadius: 12 });

    expect(StyleSheet.flatten(dressed)).toMatchObject({ borderRadius: 12 });
  });

  it('gives way to a corner the control states itself', () => {
    const { dressed } = paint({ borderRadius: 17 }, { borderRadius: 12 });

    expect(StyleSheet.flatten(dressed)).toMatchObject({ borderRadius: 17 });
  });
});
