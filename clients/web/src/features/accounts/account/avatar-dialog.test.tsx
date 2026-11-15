// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarDialog } from './avatar-dialog.component';

const auth = vi.hoisted(() => ({ uploadAvatar: vi.fn(), updateUser: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: { accounts: { uploadAvatar: auth.uploadAvatar } },
    updateUser: auth.updateUser,
  }),
}));

function Providers({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <KitProvider config={{ entry: { physicalKeyboard: true } }}>
      {onScreen(<>{children}</>)}
    </KitProvider>
  );
}

const inputHost = createInputTestHost();
const onClose = vi.fn();
const PICKED = new File(['original'], 'me.jpg', { type: 'image/jpeg' });
const PHOTO_URL = 'blob:http://localhost/picked';

function press(name: string) {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

function open() {
  return inputHost.render(<AvatarDialog file={PICKED} src={PHOTO_URL} onClose={onClose} />, {
    wrapper: Providers,
  });
}

function photoDecodes() {
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(200);
  vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function arrive(
    this: HTMLImageElement,
  ) {
    queueMicrotask(() => this.onload?.(new Event('load')));
  });
}

function canvasDraws(draws = true) {
  const sized: HTMLCanvasElement[] = [];
  const context = { translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function draw(
    this: HTMLCanvasElement,
  ) {
    sized.push(this);
    return (draws ? context : null) as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, type) =>
    done(new Blob(['framed'], { type })),
  );
  return { context, sized };
}

beforeEach(photoDecodes);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('framing a picked photo', () => {
  it('uploads the crop as a 512 px WebP, shows the new avatar and closes', async () => {
    const { sized } = canvasDraws();
    auth.uploadAvatar.mockResolvedValue({ avatarUrl: '/api/images/new.webp' });
    open();

    press('Use this photo');

    await waitFor(() => expect(auth.uploadAvatar).toHaveBeenCalled());
    const sent = auth.uploadAvatar.mock.calls[0]?.[0] as Blob;
    expect(sent.type).toBe('image/webp');
    expect(sized[0]?.width).toBe(512);
    expect(sized[0]?.height).toBe(512);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.updateUser).toHaveBeenCalledWith({ avatarUrl: '/api/images/new.webp' });
  });

  it('crops what the person framed: closer and turned', async () => {
    const { context } = canvasDraws();
    auth.uploadAvatar.mockResolvedValue({ avatarUrl: '/api/images/new.webp' });
    open();
    await screen.findByRole('button', { name: 'Zoom in' });

    press('Zoom in');
    press('Rotate left');
    press('Use this photo');

    await waitFor(() => expect(auth.uploadAvatar).toHaveBeenCalled());
    expect(context.scale).toHaveBeenCalledWith(3.2, 3.2);
    expect(context.rotate).toHaveBeenCalledWith((270 * Math.PI) / 180);
  });

  it('sends the photo as it was picked when the browser cannot draw the crop', async () => {
    canvasDraws(false);
    auth.uploadAvatar.mockResolvedValue({ avatarUrl: '/api/images/new.webp' });
    open();

    press('Use this photo');

    await waitFor(() => expect(auth.uploadAvatar).toHaveBeenCalledWith(PICKED));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and says why when the upload is refused', async () => {
    canvasDraws();
    auth.uploadAvatar.mockRejectedValue(new Error('nope'));
    open();

    press('Use this photo');

    expect(await screen.findByText('Image upload failed')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('uploads nothing when it is cancelled', () => {
    canvasDraws();
    open();

    press('Cancel');

    expect(onClose).toHaveBeenCalled();
    expect(auth.uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the picked photo in a frame that can be moved', () => {
    canvasDraws();
    open();

    const frame = screen.getByRole('button', { name: 'Move the photo' });

    expect(frame.querySelector('img')?.getAttribute('src')).toBe(PHOTO_URL);
  });
});
