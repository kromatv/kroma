import { afterEach, describe, expect, it, vi } from 'vitest';
import type { style } from './ansi';

const wasTTY = process.stdout.isTTY;

async function styledOn(isTTY: boolean, noColor?: string): Promise<typeof style> {
  Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
  vi.stubEnv('NO_COLOR', noColor);
  vi.resetModules();
  return (await import('./ansi')).style;
}

afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { value: wasTTY, configurable: true });
  vi.unstubAllEnvs();
});

describe('style', () => {
  it('wraps text in the code the terminal reads', async () => {
    const styled = await styledOn(true);

    expect(styled.bold('KROMA')).toBe('\x1b[1mKROMA\x1b[0m');
    expect(styled.red('failed')).toBe('\x1b[31mfailed\x1b[0m');
  });

  it('leaves text alone when it is not a terminal reading it', async () => {
    const styled = await styledOn(false);

    expect(styled.green('installed')).toBe('installed');
  });

  it('leaves text alone on a terminal that was asked for no colour', async () => {
    const styled = await styledOn(true, '1');

    expect(styled.yellow('nothing new')).toBe('nothing new');
    expect(styled.dim('192.168.1.10')).toBe('192.168.1.10');
  });
});
