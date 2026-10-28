// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SvgXml } from '#ui/lib/svg';

afterEach(cleanup);

describe('SvgXml', () => {
  it('sizes a document that only declares a viewBox to its box', () => {
    const { container } = render(
      <SvgXml xml='<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' width="100%" />,
    );

    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('width')).toBe('100%');
    expect(svg?.getAttribute('height')).toBe('100%');
  });

  it('keeps the size a document already declares', () => {
    const { container } = render(
      <SvgXml xml='<svg width="24" height="24" viewBox="0 0 24 24"/>' />,
    );

    expect(container.querySelector('svg')?.getAttribute('width')).toBe('24');
  });

  it('sizes a document that opens with an XML prolog', () => {
    const { container } = render(
      <SvgXml xml='<?xml version="1.0"?><svg viewBox="0 0 10 10"/>' width="100%" />,
    );

    expect(container.querySelector('svg')?.getAttribute('width')).toBe('100%');
  });

  it('leaves a document that declares only a height alone', () => {
    const { container } = render(<SvgXml xml='<svg height="24" viewBox="0 0 24 24"/>' />);

    expect(container.querySelector('svg')?.getAttribute('height')).toBe('24');
  });
});
