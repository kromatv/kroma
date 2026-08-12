// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { partContext } from './part-context';

interface Shape {
  gap: number;
}

const [ShapeContext, useShape] = partContext<Shape>('Widget.Root');

describe('partContext', () => {
  it('hands a part what the Root published', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ShapeContext.Provider value={{ gap: 12 }}>{children}</ShapeContext.Provider>
    );
    const { result } = renderHook(() => useShape('Label'), { wrapper });
    expect(result.current).toEqual({ gap: 12 });
  });

  it('names the part and its owner when read outside the Root', () => {
    expect(() => renderHook(() => useShape('Label'))).toThrow(
      '<Widget.Label> must be used inside <Widget.Root>',
    );
  });

  it('takes the owner apart at the first dot, so a non-Root owner reads right', () => {
    const [, useRow] = partContext<Shape>('Select.Item');
    expect(() => renderHook(() => useRow('Indicator'))).toThrow(
      '<Select.Indicator> must be used inside <Select.Item>',
    );
  });
});
