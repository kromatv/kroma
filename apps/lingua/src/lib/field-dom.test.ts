// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fieldOf,
  focusField,
  keyOfField,
  measureField,
  messageFields,
  selectionOf,
} from './field-dom';

function page(): void {
  document.body.innerHTML = `
    <div data-message="a.one"><p>Source</p><textarea>One</textarea></div>
    <div data-message="a.two"><textarea>Two</textarea></div>
    <textarea id="search"></textarea>`;
}

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('expected an element');
  }
  return value;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('fieldOf', () => {
  it('finds the field of a message by its key, dots and all', () => {
    page();

    expect(fieldOf('a.two')?.value).toBe('Two');
    expect(fieldOf('a.three')).toBeNull();
  });
});

describe('keyOfField', () => {
  it('names the message a field belongs to, and none for any other field', () => {
    page();
    const [one] = messageFields();

    expect(one && keyOfField(one)).toBe('a.one');
    expect(keyOfField(present(document.getElementById('search')))).toBeNull();
  });
});

describe('messageFields', () => {
  it('lists the message fields in page order, and no other field', () => {
    page();

    expect(messageFields().map((field) => field.value)).toEqual(['One', 'Two']);
  });
});

describe('focusField', () => {
  it('focuses the field with its caret where asked, and reads it back', () => {
    page();
    const field = present(fieldOf('a.one'));
    const scroll = vi.fn();
    field.scrollIntoView = scroll;

    focusField(field, 2);

    expect(document.activeElement).toBe(field);
    expect(selectionOf(field)).toEqual({ start: 2, end: 2 });
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
  });

  it('keeps the caret where it was when none is asked', () => {
    page();
    const field = present(fieldOf('a.two'));
    field.setSelectionRange(1, 3);

    focusField(field);

    expect(selectionOf(field)).toEqual({ start: 1, end: 3 });
  });
});

describe('measureField', () => {
  it('reads the padding and the type a field is set in', () => {
    page();
    const field = present(fieldOf('a.one'));
    field.style.cssText =
      'padding: 4px 6px 8px 10px; font-family: Hanken; font-size: 16px; font-weight: 500; line-height: 24px; letter-spacing: 0.5px';

    const box = measureField(field, document.body);

    expect(box).toMatchObject({
      padding: { top: 4, right: 6, bottom: 8, left: 10 },
      fontFamily: 'Hanken',
      fontSize: 16,
      fontWeight: '500',
      lineHeight: 24,
      letterSpacing: 0.5,
      scrollTop: 0,
    });
  });

  it('falls back to the font size for a line height it cannot read', () => {
    page();
    const field = present(fieldOf('a.two'));
    field.style.cssText = 'font-size: 10px; line-height: normal';

    expect(measureField(field, document.body).lineHeight).toBe(12);
  });
});
