import { afterEach, describe, expect, it, vi } from 'vitest';
import { exitAfter } from './exit-after';

afterEach(() => vi.restoreAllMocks());

function stubbed() {
  return {
    exit: vi.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never),
    error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  };
}

describe('exitAfter', () => {
  it('exits with a code handed to it as a plain number', async () => {
    const { exit } = stubbed();

    await exitAfter(0);

    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits with the code a promise resolved to', async () => {
    const { exit } = stubbed();

    await exitAfter(Promise.resolve(1));

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('prints a thrown error message alone and exits 1', async () => {
    const { exit, error } = stubbed();

    await exitAfter(Promise.reject(new Error('cargo build failed')));

    expect(error).toHaveBeenCalledWith('cargo build failed');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('prints what was thrown when it is not an error at all', async () => {
    const { exit, error } = stubbed();

    await exitAfter(Promise.reject('nothing like an Error'));

    expect(error).toHaveBeenCalledWith('nothing like an Error');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
