import { describe, expect, it } from 'vitest';
import { MAX_PIN_BYTES, readBounded } from './files';
import { layout } from './layout';
import { parsePins } from './pins';
import { root } from './root';

const at = layout(root);

describe('the committed pins', () => {
  it('pin all three tools to a commit', () => {
    const pins = parsePins(readBounded(at.pins, MAX_PIN_BYTES));

    expect(pins.map((pin) => pin.name)).toEqual(['crapper', 'dryer', 'mutator']);
  });

  it('hold every Python dependency at an exact version', () => {
    const requirements = readBounded(at.requirements, MAX_PIN_BYTES).trim().split('\n');

    expect(requirements.length).toBeGreaterThan(0);
    for (const requirement of requirements) {
      expect(requirement).toMatch(/^[\w.-]+==\d+(?:\.\d+)*$/);
    }
  });
});
