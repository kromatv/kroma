// @vitest-environment jsdom
import { StyleSheet } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { declared } from '#ui/testing';
import { classes } from './classed';

const { lead } = StyleSheet.create({ lead: { paddingStart: 6 } });

const painted = (className: string | undefined) => {
  const el = document.createElement('div');
  el.className = className ?? '';
  document.body.append(el);
  return el;
};

afterEach(() => {
  document.documentElement.removeAttribute('dir');
  document.body.replaceChildren();
});

describe('classes', () => {
  it('lays a start on the left of a page written left to right', () => {
    const el = painted(classes(lead));

    expect(declared(el, 'paddingLeft')).toBe('6px');
  });

  it('lays a start on the right of a page written right to left', () => {
    document.documentElement.dir = 'rtl';

    const el = painted(classes(lead));

    expect(declared(el, 'paddingRight')).toBe('6px');
  });
});
