// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStageRatio } from './stage-ratio';

const NODES: HTMLElement[] = [];

function stage(id: string, width: number, height: number): HTMLElement {
  const node = document.createElement('div');
  node.id = id;
  node.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  document.body.append(node);
  NODES.push(node);
  return node;
}

afterEach(() => {
  for (const node of NODES.splice(0)) node.remove();
});

describe('useStageRatio (web)', () => {
  it('prefers the stage it can measure over the shape it was handed', () => {
    stage('stage-a', 1920, 1080);
    const { result } = renderHook(() => useStageRatio('stage-a', 1728 / 880));
    expect(result.current).toBeCloseTo(16 / 9, 6);
  });

  it('keeps the handed shape while there is no stage to read', () => {
    const { result } = renderHook(() => useStageRatio('stage-missing', 1728 / 880));
    expect(result.current).toBeCloseTo(1728 / 880, 6);
  });

  it('ignores a stage that has not been laid out yet', () => {
    stage('stage-b', 0, 0);
    const { result } = renderHook(() => useStageRatio('stage-b', 4 / 3));
    expect(result.current).toBeCloseTo(4 / 3, 6);
  });
});
