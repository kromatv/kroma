// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetails } from '#ui/lib/control';
import type { CropTransform } from '#ui/lib/crop-geometry';
import { act as call, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { Cropper, type CropperRootProps, useCropper } from './index';

vi.mock('#ui/lib/image-size', () => ({
  imageSize: () => Promise.resolve({ width: 400, height: 200 }),
}));

const PHOTO = 'https://kroma.test/photo.jpg';

function Zoom() {
  return <span role="status">{useCropper().transform.zoom}</span>;
}

async function show(props: Partial<CropperRootProps> = {}) {
  render(
    onScreen(
      <Cropper.Root src={PHOTO} {...props}>
        <Cropper.Zoom />
        <Zoom />
      </Cropper.Root>,
    ),
  );
  await act(async () => {
    await new Promise((settled) => setTimeout(settled, 0));
  });
}

const zoom = () => screen.getByRole('status').textContent;

const zoomIn = () => fireEvent.click(screen.getByLabelText('Zoom in'));

const refuse = (_next: CropTransform, details: ChangeDetails) => details.cancel();

describe('the transform of <Cropper>', () => {
  it('moves under a press when the cropper runs itself', async () => {
    await show();

    zoomIn();

    expect(zoom()).toBe('1.25');
  });

  it('stays where it was when the app cancels the move', async () => {
    await show({ onValueChange: refuse });

    zoomIn();

    expect(zoom()).toBe('1');
  });
});

describe('the transform under a developer tool', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is read with the actions open from where the picture sits', async () => {
    await show();

    const read = snapshot().map(({ kind, actions }) => ({ kind, actions }));

    expect(read).toEqual([
      {
        kind: 'cropper',
        actions: ['setValue', 'setTransform', 'panBy', 'zoomBy', 'rotate'],
      },
    ]);
  });

  it('is clamped on screen when a tool writes a value past the bounds', async () => {
    await show();

    await call({
      steps: [{ ref: 'c1', action: 'setValue', args: [{ zoom: 9, x: 0, y: 0, rotation: 0 }] }],
    });

    expect(zoom()).toBe('3');
  });

  it('is refused while there is no picture', async () => {
    await show({ src: null });

    const report = await call({ steps: [{ ref: 'c1', action: 'zoomBy', args: [1] }] });

    expect(report.error?.message).toMatch(/disabled/);
    expect(zoom()).toBe('1');
  });
});
