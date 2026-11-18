// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flexGaps } from './flex-gaps';

const settled = () => new Promise((resolve) => setTimeout(resolve, 50));
const undo: Array<() => void> = [];

afterEach(() => {
  undo.splice(0).forEach((step) => step());
  document.body.innerHTML = '';
});

describe('flexGaps', () => {
  it('spaces an inline gap on an engine whose flexbox has none', async () => {
    undo.push(flexGaps(document));
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'row';
    row.append(document.createElement('div'), document.createElement('div'));
    document.body.appendChild(row);

    row.style.gap = '12px';
    await settled();

    expect(row.hasAttribute('data-kroma-gap')).toBe(true);
  });

  it('puts the engine back once disposed', () => {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');

    flexGaps(document)();

    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')).toEqual(before);
  });
});
