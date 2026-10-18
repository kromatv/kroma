import type { Condition, ConditionType } from './rules-schemas';

const BLANK: { [Type in ConditionType]: () => Extract<Condition, { type: Type }> } = {
  releaseTitle: () => ({ negate: false, required: false, type: 'releaseTitle', pattern: '' }),
  releaseGroup: () => ({ negate: false, required: false, type: 'releaseGroup', pattern: '' }),
  edition: () => ({ negate: false, required: false, type: 'edition', pattern: '' }),
  language: () => ({ negate: false, required: false, type: 'language', value: 'fr' }),
  subtitle: () => ({ negate: false, required: false, type: 'subtitle', value: 'fr' }),
  source: () => ({ negate: false, required: false, type: 'source', value: 'WebDl' }),
  resolution: () => ({ negate: false, required: false, type: 'resolution', value: 'R1080' }),
  videoCodec: () => ({ negate: false, required: false, type: 'videoCodec', value: 'Hevc' }),
  hdr: () => ({ negate: false, required: false, type: 'hdr', value: null }),
  audio: () => ({ negate: false, required: false, type: 'audio', codec: null, minChannels: null }),
  size: () => ({ negate: false, required: false, type: 'size', minGb: null, maxGb: null }),
  indexerFlag: () => ({ negate: false, required: false, type: 'indexerFlag', value: 'freeleech' }),
  releaseType: () => ({
    negate: false,
    required: false,
    type: 'releaseType',
    value: 'seasonPack',
  }),
  year: () => ({ negate: false, required: false, type: 'year', min: null, max: null }),
};

export function blankCondition(type: ConditionType): Condition {
  return BLANK[type]();
}

/** `negate` and `required` carry over to the new type. */
export function retypeCondition(condition: Condition, type: ConditionType): Condition {
  if (condition.type === type) return condition;
  return { ...blankCondition(type), negate: condition.negate, required: condition.required };
}

/** A condition under edit. The wire shape carries no id and the admin orders
 *  the list, so the editor mints one and keys its rows on it: removing a row
 *  must not shift the one below it onto another row's controls. */
export interface DraftCondition {
  id: string;
  condition: Condition;
}

export function draftConditions(conditions: readonly Condition[]): DraftCondition[] {
  return conditions.map((condition, index) => ({ id: rowId(index), condition }));
}

export function rowId(seed: number): string {
  return `condition-${seed}`;
}

export function conditionsOf(rows: readonly DraftCondition[]): Condition[] {
  return rows.map((row) => row.condition);
}

export function appendCondition(
  rows: readonly DraftCondition[],
  id: string,
  type: ConditionType,
): DraftCondition[] {
  return [...rows, { id, condition: blankCondition(type) }];
}

export function withCondition(
  rows: readonly DraftCondition[],
  id: string,
  condition: Condition,
): DraftCondition[] {
  return rows.map((row) => (row.id === id ? { ...row, condition } : row));
}

export function withoutCondition(rows: readonly DraftCondition[], id: string): DraftCondition[] {
  return rows.filter((row) => row.id !== id);
}
