import { describe, expect, it } from 'vitest';
import {
  appendCondition,
  blankCondition,
  conditionsOf,
  draftConditions,
  retypeCondition,
  withCondition,
  withoutCondition,
} from './condition-draft';
import { CONDITION_TYPES, Condition } from './rules-schemas';

describe('blankCondition', () => {
  it('builds a condition the server can read for every type it offers', () => {
    for (const type of CONDITION_TYPES) {
      expect(Condition.safeParse(blankCondition(type)).success).toBe(true);
    }
  });

  it('starts a pattern empty and a choice on a real value', () => {
    expect(blankCondition('releaseTitle')).toEqual({
      negate: false,
      required: false,
      type: 'releaseTitle',
      pattern: '',
    });
    expect(blankCondition('source')).toMatchObject({ type: 'source', value: 'WebDl' });
  });

  it('asks for any HDR rather than naming one', () => {
    expect(blankCondition('hdr')).toMatchObject({ type: 'hdr', value: null });
  });
});

describe('retypeCondition', () => {
  it('swaps the payload for the new type and keeps the two flags', () => {
    const was = { negate: true, required: true, type: 'releaseTitle', pattern: 'VFF' } as const;

    const now = retypeCondition(was, 'resolution');

    expect(now).toEqual({ negate: true, required: true, type: 'resolution', value: 'R1080' });
  });

  it('leaves a condition already of that type untouched', () => {
    const was = blankCondition('size');

    expect(retypeCondition(was, 'size')).toBe(was);
  });
});

describe('draftConditions', () => {
  it('gives each condition an id of its own, and hands the list back unchanged', () => {
    const list = [blankCondition('releaseTitle'), blankCondition('hdr')];

    const rows = draftConditions(list);

    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    expect(conditionsOf(rows)).toEqual(list);
  });
});

describe('withCondition', () => {
  it('writes the row with that id and leaves its neighbours', () => {
    const rows = draftConditions([blankCondition('releaseTitle'), blankCondition('hdr')]);

    const next = withCondition(rows, rows[1]?.id ?? '', blankCondition('audio'));

    expect(next.map((row) => row.condition.type)).toEqual(['releaseTitle', 'audio']);
    expect(next).not.toBe(rows);
  });

  it('ignores an id the list does not hold', () => {
    const rows = draftConditions([blankCondition('releaseTitle')]);

    expect(conditionsOf(withCondition(rows, 'gone', blankCondition('size')))).toEqual(
      conditionsOf(rows),
    );
  });
});

describe('withoutCondition', () => {
  it('drops the row with that id, whatever its place', () => {
    const rows = draftConditions([
      blankCondition('releaseTitle'),
      blankCondition('hdr'),
      blankCondition('size'),
    ]);

    const next = withoutCondition(rows, rows[1]?.id ?? '');

    expect(next.map((row) => row.condition.type)).toEqual(['releaseTitle', 'size']);
    expect(next.map((row) => row.id)).toEqual([rows[0]?.id, rows[2]?.id]);
  });
});

describe('appendCondition', () => {
  it('adds a blank row under the id it was given', () => {
    const rows = appendCondition(draftConditions([]), 'fresh', 'hdr');

    expect(rows).toEqual([{ id: 'fresh', condition: blankCondition('hdr') }]);
  });
});
