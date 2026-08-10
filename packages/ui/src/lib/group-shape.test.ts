// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { GroupSlotContext, groupSlot, useGroupShape } from './group-shape';

const inGroup = ({ children }: { children: ReactNode }) =>
  createElement(GroupSlotContext.Provider, {
    value: groupSlot('horizontal', 'first', 12, 'md'),
    children,
  });

describe('useGroupShape', () => {
  it('is null outside a group, so an ungrouped control keeps its own shape', () => {
    const { result } = renderHook(() => useGroupShape());
    expect(result.current).toBeNull();
  });

  it('drops the corners the member shares with the one after it', () => {
    const { result } = renderHook(() => useGroupShape(), { wrapper: inGroup });
    expect(result.current).toMatchObject({
      borderTopLeftRadius: 12,
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
    });
  });
});
