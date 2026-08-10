import { afterEach, describe, expect, it, vi } from 'vitest';
import { exitAfterBuild } from './exit-after-build';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exitAfterBuild', () => {
  it('sorts after every other plugin, on both axes', () => {
    const plugin = exitAfterBuild();
    expect(plugin.name).toBe('kroma:exit-after-build');
    expect(plugin.enforce).toBe('post');
    expect(plugin.buildApp).toMatchObject({ order: 'post' });
  });

  it('ends the process with a success code, so a `build && …` chain carries on', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { handler } = exitAfterBuild().buildApp as { handler: () => Promise<void> };

    await handler.call(null);
    expect(exit).not.toHaveBeenCalled();

    await new Promise((resolve) => setImmediate(resolve));
    expect(exit).toHaveBeenCalledWith(0);
  });
});
