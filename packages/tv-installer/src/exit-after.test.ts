import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitAfter } from './exit-after';

let exit: ReturnType<typeof vi.spyOn>;
let errors: string[];

beforeEach(() => {
  errors = [];
  exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never);
  vi.spyOn(console, 'error').mockImplementation((...parts) => errors.push(parts.join(' ')));
});

afterEach(() => vi.restoreAllMocks());

describe('exitAfter', () => {
  it('exits with the code the work answered', async () => {
    await exitAfter(Promise.resolve(3));

    expect(exit).toHaveBeenCalledWith(3);
  });

  it('exits with a code that was handed over rather than awaited', async () => {
    await exitAfter(0);

    expect(exit).toHaveBeenCalledWith(0);
  });

  it('prints what went wrong and exits one', async () => {
    await exitAfter(Promise.reject(new Error('sdb refused the connection')));

    expect(errors).toEqual(['sdb refused the connection']);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('prints a rejection that is not an error as it reads', async () => {
    await exitAfter(Promise.reject('no device'));

    expect(errors).toEqual(['no device']);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
