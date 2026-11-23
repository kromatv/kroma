import { describe, expect, it } from 'vitest';
import { readServerTiming } from './server-timing';

describe('readServerTiming', () => {
  it('reads the route and the total a KROMA server reports', () => {
    const header = 'total;dur=31.4, scope;desc="GET /api/shows/{id}", sql;dur=12.0;desc="9 sql"';

    expect(readServerTiming(header)).toEqual({ route: 'GET /api/shows/{id}', serverMs: 31.4 });
  });

  it('answers null for a header from anything else', () => {
    expect(readServerTiming('cfExtPri;dur=0')).toBeNull();
    expect(readServerTiming(null)).toBeNull();
    expect(readServerTiming('total;dur=abc, scope;desc="GET /x"')).toBeNull();
  });
});
