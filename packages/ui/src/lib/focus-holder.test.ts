import { describe, expect, it } from 'vitest';
import { createFocusHolder } from './focus-holder';

const first = { name: 'first' };
const second = { name: 'second' };

describe('the focus holder', () => {
  it('holds nothing until a view takes the focus', () => {
    expect(createFocusHolder().view()).toBeNull();
  });

  it('is the view that last took the focus', () => {
    const holder = createFocusHolder();
    holder.hold(first);

    holder.hold(second);

    expect(holder.view()).toBe(second);
  });

  it('is cleared when the holder drops the focus', () => {
    const holder = createFocusHolder();
    holder.hold(first);

    holder.drop(first);

    expect(holder.view()).toBeNull();
  });

  it('stays when a view that no longer holds the focus drops it', () => {
    const holder = createFocusHolder();
    holder.hold(first);
    holder.hold(second);

    holder.drop(first);

    expect(holder.view()).toBe(second);
  });

  it('holds nothing when the control that took the focus has no view', () => {
    const holder = createFocusHolder();
    holder.hold(first);

    holder.hold(undefined);

    expect(holder.view()).toBeNull();
  });

  it('keeps one host apart from another', () => {
    const holder = createFocusHolder();

    holder.hold(first);

    expect(createFocusHolder().view()).toBeNull();
  });
});
