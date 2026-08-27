import { describe, expect, it } from 'vitest';
import { DOWNLOAD_BOXES } from './download-columns';

describe('the downloads columns', () => {
  it('names to the table only the columns the server can order by', () => {
    const named = DOWNLOAD_BOXES.map((box) => box.column);

    expect(named).toEqual(['release', 'progress', undefined, 'status', 'added', undefined]);
  });
});
