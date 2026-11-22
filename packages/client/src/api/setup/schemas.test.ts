import { describe, expect, it } from 'vitest';
import { SetupAnswer } from './schemas';

const RUNNING = { start: 'fresh', step: 'media', reached: 'people', ended: false, checklist: [] };

describe('a setup answer', () => {
  it('reads a setup the owner is on', () => {
    const read = SetupAnswer.parse({ setup: RUNNING });

    expect(read.setup?.reached).toBe('people');
  });

  it('reads no setup', () => {
    const read = SetupAnswer.parse({ setup: null });

    expect(read.setup).toBeNull();
  });

  it('leaves out a line this client does not know', () => {
    const read = SetupAnswer.parse({
      setup: { ...RUNNING, ended: true, checklist: ['media', 'backups', 'people'] },
    });

    expect(read.setup?.checklist).toEqual(['media', 'people']);
  });
});
