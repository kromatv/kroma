// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropImage } from '#ui/lib/crop-image';
import { onScreen } from '#ui/testing';
import { Cropper, type CropperRootProps, type CropperState, useCropper } from './index';

vi.mock('#ui/lib/crop-image', () => ({ cropImage: vi.fn(() => Promise.resolve(null)) }));
vi.mock('#ui/lib/image-size', () => ({
  imageSize: () => Promise.resolve({ width: 400, height: 200 }),
}));

const PHOTO = 'https://kroma.test/photo.jpg';

const held: { cropper: CropperState | null } = { cropper: null };

function Probe() {
  const state = useCropper();
  useLayoutEffect(() => {
    held.cropper = state;
  });
  return null;
}

const cropper = (): CropperState => {
  if (!held.cropper) throw new Error('no cropper mounted');
  return held.cropper;
};

const settle = () =>
  act(async () => {
    await new Promise((settled) => setTimeout(settled, 0));
  });

async function show(props: Partial<CropperRootProps> = {}) {
  render(
    onScreen(
      <Cropper.Root src={PHOTO} {...props}>
        <Cropper.Frame />
        <Cropper.Zoom />
        <Cropper.Rotate />
        <Cropper.Rotate direction="right" label="Rotate right" />
        <Cropper.Reset />
        <Probe />
      </Cropper.Root>,
    ),
  );
  await settle();
}

const frame = () => screen.getByLabelText('Crop');
const picture = () => frame().querySelector('img')?.parentElement?.parentElement as HTMLElement;

const grab = () => fireEvent.click(frame());
const key = (name: string) => fireEvent.keyDown(document, { key: name });
const press = (label: string) => fireEvent.click(screen.getByLabelText(label));
const isOff = (label: string) =>
  screen.getByLabelText(label).getAttribute('aria-disabled') === 'true';

afterEach(() => {
  cleanup();
  held.cropper = null;
  vi.clearAllMocks();
});

describe('Cropper', () => {
  it('opens on the picture centred and just covering the frame', async () => {
    await show();

    expect(cropper().transform).toEqual({ zoom: 1, x: 0, y: 0, rotation: 0 });
    expect(cropper().image).toEqual({ width: 400, height: 200 });
    expect(picture().style.left).toBe('-50%');
    expect(picture().style.width).toBe('200%');
    expect(picture().style.height).toBe('100%');
  });

  it('leaves the keys alone until the frame is pressed', async () => {
    await show();

    expect(key('ArrowRight')).toBe(true);
    expect(cropper().transform.x).toBe(0);
  });

  it('pans on the arrow keys once pressed, and stops where the picture ends', async () => {
    await show();
    grab();

    expect(key('ArrowRight')).toBe(false);
    expect(cropper().transform.x).toBeCloseTo(0.02);
    expect(key('ArrowLeft')).toBe(false);
    expect(cropper().transform.x).toBeCloseTo(0);
    expect(key('ArrowDown')).toBe(false);
    expect(cropper().transform.y).toBe(0);
  });

  it('pans up and down once zoomed in', async () => {
    await show({ defaultValue: { zoom: 2, x: 0, y: 0, rotation: 0 } });
    grab();

    key('ArrowDown');
    expect(cropper().transform.y).toBeCloseTo(0.02);
    key('Up');
    expect(cropper().transform.y).toBeCloseTo(0);
  });

  it('zooms on plus and minus while pressed', async () => {
    await show();
    grab();

    expect(key('+')).toBe(false);
    expect(cropper().transform.zoom).toBeCloseTo(1.1);
    key('=');
    expect(cropper().transform.zoom).toBeCloseTo(1.2);
    key('-');
    key('_');
    expect(cropper().transform.zoom).toBeCloseTo(1);
  });

  it('says it holds the keys, and gives them back on Escape, Enter or a second press', async () => {
    await show();
    grab();
    expect(frame().getAttribute('aria-pressed')).toBe('true');

    expect(key('Escape')).toBe(false);
    expect(frame().getAttribute('aria-pressed')).toBe('false');
    expect(key('ArrowRight')).toBe(true);

    grab();
    key('Enter');
    expect(key('ArrowRight')).toBe(true);

    grab();
    grab();
    expect(key('ArrowRight')).toBe(true);
  });

  it('leaves a key it does not act on to the page', async () => {
    await show();
    grab();

    expect(key('Tab')).toBe(true);
  });

  it('zooms in by steps and stops at the top of the range', async () => {
    await show({ maxZoom: 1.5 });
    expect(isOff('Zoom out')).toBe(true);

    press('Zoom in');
    expect(cropper().transform.zoom).toBe(1.25);
    press('Zoom in');
    expect(cropper().transform.zoom).toBe(1.5);
    expect(isOff('Zoom in')).toBe(true);

    press('Zoom out');
    press('Zoom out');
    press('Zoom out');
    expect(cropper().transform.zoom).toBe(1);
  });

  it('turns the picture a quarter each way', async () => {
    await show();

    press('Rotate');
    expect(cropper().transform.rotation).toBe(270);
    expect(picture().style.transform).toBe('rotate(270deg)');
    press('Rotate right');
    press('Rotate right');
    expect(cropper().transform.rotation).toBe(90);
  });

  it('puts the picture back where it opened', async () => {
    await show();
    expect(isOff('Reset')).toBe(true);
    press('Zoom in');
    press('Rotate');
    grab();
    key('ArrowRight');

    press('Reset');

    expect(cropper().transform).toEqual({ zoom: 1, x: 0, y: 0, rotation: 0 });
  });

  it('reports a change it does not own, and stays where its caller put it', async () => {
    const changed = vi.fn();
    await show({ value: { zoom: 2, x: 0, y: 0, rotation: 0 }, onValueChange: changed });

    press('Zoom in');

    expect(changed).toHaveBeenCalledWith({ zoom: 2.25, x: 0, y: 0, rotation: 0 });
    expect(cropper().transform.zoom).toBe(2);
  });

  it('clamps a value its caller hands it', async () => {
    await show({ value: { zoom: 9, x: 4, y: 4, rotation: 0 } });

    expect(cropper().transform).toEqual({ zoom: 3, x: 2.5, y: 1, rotation: 0 });
  });

  it('draws nothing and takes no press without a picture', async () => {
    await show({ src: null });

    expect(frame().querySelector('img')).toBeNull();
    expect(isOff('Crop')).toBe(true);
    expect(isOff('Zoom in')).toBe(true);
    expect(isOff('Rotate')).toBe(true);
    expect(await cropper().crop()).toBeNull();
    expect(cropImage).not.toHaveBeenCalled();
  });

  it('hands the crop to the engine as it stands', async () => {
    await show({ aspect: 2 });
    press('Rotate right');

    await cropper().crop({ width: 512 });

    expect(cropImage).toHaveBeenCalledWith(
      { src: PHOTO, transform: { zoom: 1, x: 0, y: 0, rotation: 90 }, aspect: 2 },
      { width: 512 },
    );
  });

  it('refuses a part outside a Root', () => {
    expect(() => render(<Cropper.Frame />)).toThrow(
      '<Cropper.Frame> must be used inside <Cropper.Root>',
    );
    expect(() => render(<Probe />)).toThrow('useCropper() must be used inside <Cropper.Root>');
  });
});
