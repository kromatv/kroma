// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { act, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { Resizable, type ResizableRootProps } from './index';

function Group(props: Readonly<ResizableRootProps>) {
  return (
    <Resizable.Root {...props}>
      <Resizable.Panel>
        <Text>One</Text>
      </Resizable.Panel>
      <Resizable.Handle label="Resize" />
      <Resizable.Panel>
        <Text>Two</Text>
      </Resizable.Panel>
    </Resizable.Root>
  );
}

function Owned() {
  const [layout, setLayout] = useState<readonly number[]>([50, 50]);
  return <Group layout={layout} onLayoutChange={setLayout} />;
}

const share = () => screen.getByLabelText('Resize').getAttribute('aria-valuenow');

const resizeTo = (layout: readonly number[]) =>
  act({ steps: [{ ref: 'c1', action: 'setLayout', args: [layout] }] });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
});

describe('the layout of <Resizable> under a developer tool', () => {
  it('is listed with its setter', () => {
    render(onScreen(<Group />));

    const read = snapshot().map(({ kind, actions }) => ({ kind, actions }));

    expect(read).toEqual([{ kind: 'resizable', actions: ['setLayout'] }]);
  });

  it('moves the seam and tells the app it was not a reader', async () => {
    const changed = vi.fn();
    render(onScreen(<Group onLayoutChange={changed} />));

    await resizeTo([30, 70]);

    expect(share()).toBe('30');
    expect(changed).toHaveBeenCalledWith([30, 70], { committed: true, user: false });
  });

  it('asks a caller who owns the layout, and follows its answer', async () => {
    render(onScreen(<Owned />));

    await resizeTo([30, 70]);

    expect(share()).toBe('30');
  });

  it('stays where its caller put it when the caller does not follow', async () => {
    const changed = vi.fn();
    render(onScreen(<Group layout={[50, 50]} onLayoutChange={changed} />));

    await resizeTo([30, 70]);

    expect(changed).toHaveBeenCalledWith([30, 70], { committed: true, user: false });
    expect(share()).toBe('50');
  });

  it('is refused while the group is disabled', async () => {
    render(onScreen(<Group disabled />));

    const report = await resizeTo([30, 70]);

    expect(report.error?.message).toMatch(/disabled/);
    expect(share()).toBe('50');
  });
});
