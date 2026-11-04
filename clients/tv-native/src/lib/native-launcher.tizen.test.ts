import type { PublishResult } from '@kromatv/react-native-tizen/preview';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preview = vi.hoisted(() => {
  const published = async (): Promise<PublishResult> => ({
    published: true,
    channel: 'ContentDBAPI',
  });
  return { set: vi.fn(published), clear: vi.fn(published) };
});

vi.mock('@kromatv/react-native-tizen/preview', () => ({ SmartHubPreview: preview }));

const card = (id: string) => `http://192.168.1.20:4040/api/items/${id}/card`;
const resume = JSON.stringify([
  { id: 'm1', title: 'Blade Runner', imageUrl: card('m1'), kind: 'movie' },
]);
const channels = JSON.stringify([
  { title: 'Tendances', items: [{ id: 'm5', title: 'Arrival', imageUrl: card('m5') }] },
]);

async function launcher() {
  vi.resetModules();
  const { nativeLauncher } = await import('./native-launcher.tizen');
  return nativeLauncher;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the Smart Hub launcher', () => {
  it('publishes once both rows have settled for three seconds', async () => {
    const backend = await launcher();

    backend.setContinueWatching(resume);
    backend.setHomeChannel(channels);
    await vi.advanceTimersByTimeAsync(2999);
    const beforeSettling = preview.set.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);

    expect(beforeSettling).toBe(0);
    expect(preview.set).toHaveBeenCalledOnce();
    expect(preview.set).toHaveBeenCalledWith([expect.anything(), expect.anything()]);
  });

  it('publishes the last rows when they change while settling', async () => {
    const backend = await launcher();

    backend.setHomeChannel(channels);
    await vi.advanceTimersByTimeAsync(2000);
    backend.setContinueWatching(resume);
    await vi.advanceTimersByTimeAsync(3000);

    expect(preview.set).toHaveBeenCalledOnce();
    expect(preview.set).toHaveBeenCalledWith([expect.anything(), expect.anything()]);
  });

  it('publishes nothing while there was never anything to show', async () => {
    const backend = await launcher();

    backend.setContinueWatching('[]');
    backend.setHomeChannel('[]');
    await vi.advanceTimersByTimeAsync(3000);

    expect(preview.set).not.toHaveBeenCalled();
    expect(preview.clear).not.toHaveBeenCalled();
  });

  it('clears the tiles once the rows it published are empty', async () => {
    const backend = await launcher();
    backend.setContinueWatching(resume);
    await vi.advanceTimersByTimeAsync(3000);

    backend.setContinueWatching('[]');
    await vi.advanceTimersByTimeAsync(3000);

    expect(preview.clear).toHaveBeenCalledOnce();
  });

  it('logs why the TV did not publish', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    preview.set.mockResolvedValueOnce({ published: false, reason: 'no preview service' });
    const backend = await launcher();

    backend.setContinueWatching(resume);
    await vi.advanceTimersByTimeAsync(3000);

    expect(log).toHaveBeenCalledWith('[KROMA] Smart Hub preview not published: no preview service');
  });
});
