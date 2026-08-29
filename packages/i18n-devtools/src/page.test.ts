import { afterEach, describe, expect, it } from 'vitest';
import { pageRecord } from './page';

const KEY = '__kromaPageRecordTest';

afterEach(() => {
  Reflect.deleteProperty(globalThis, KEY);
});

describe('a record the whole page shares', () => {
  it('makes one the first time anything asks', () => {
    expect(pageRecord(KEY, () => ({ made: 1 }))()).toEqual({ made: 1 });
  });

  it('hands the same one back every time after', () => {
    const read = pageRecord(KEY, () => ({ made: 1 }));

    expect(read()).toBe(read());
  });

  it('hands it to another copy of the module that never made one', () => {
    pageRecord(KEY, () => ({ made: 1 }))();

    const elsewhere = pageRecord(KEY, () => ({ made: 2 }));

    expect(elsewhere()).toEqual({ made: 1 });
  });

  it('makes a fresh one once the page no longer holds it', () => {
    const read = pageRecord(KEY, () => ({ made: 1 }));
    const first = read();
    Reflect.deleteProperty(globalThis, KEY);

    expect(read()).not.toBe(first);
  });
});
