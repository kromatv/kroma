import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { synopsisLead } from './synopsis';

const DUNE =
  "Le voyage mythique de Paul Atreides qui s'allie à Chani et aux Fremen dans sa quête de vengeance. " +
  "Devant choisir entre l'amour de sa vie et le destin de l'univers, il fera tout pour empêcher un terrible futur. " +
  'Lui seul peut le prévoir.';

describe.each(['the platform segmenter', 'the punctuation rule'])('synopsisLead with %s', (how) => {
  const segmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');

  beforeEach(() => {
    if (how === 'the punctuation rule') {
      Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true });
    }
  });

  afterEach(() => {
    if (segmenter) Object.defineProperty(Intl, 'Segmenter', segmenter);
  });

  it('keeps a synopsis that fits as it is', () => {
    expect(synopsisLead('A crew of thieves. One last job.', 200)).toBe(
      'A crew of thieves. One last job.',
    );
  });

  it('stops at the last whole sentence that fits, with no ellipsis', () => {
    const lead = synopsisLead(DUNE, 150);

    expect(lead).toBe(
      "Le voyage mythique de Paul Atreides qui s'allie à Chani et aux Fremen dans sa quête de vengeance.",
    );
  });

  it('takes a second sentence when there is room for it', () => {
    const lead = synopsisLead(DUNE, 230);

    expect(lead.endsWith('terrible futur.')).toBe(true);
    expect(lead).not.toContain('Lui seul');
  });

  it('shows the first sentence whole even when it alone runs past the budget', () => {
    const long = `${'A very long opening sentence that goes on and on '.repeat(4).trim()}. Then a short one.`;

    const lead = synopsisLead(long, 60);

    expect(lead.endsWith('on and on.')).toBe(true);
    expect(lead).not.toContain('Then');
  });

  it('does not take an initial or a title for the end of a sentence', () => {
    const text = `Dr. Strange meets J. K. Simmons in Paris. ${'They talk for a long while about everything. '.repeat(6)}`;

    expect(synopsisLead(text, 50)).toBe('Dr. Strange meets J. K. Simmons in Paris.');
  });

  it('ends a sentence on a question, an exclamation or a closing quote', () => {
    const text = `Who killed him? "Nobody knows." ${'The town keeps its secrets well. '.repeat(8)}`;

    expect(synopsisLead(text, 20)).toBe('Who killed him?');
    expect(synopsisLead(text, 40)).toBe('Who killed him? "Nobody knows."');
  });

  it('ends a sentence on a full-width stop, which no space follows', () => {
    const text =
      '消えた子供を探す四つの家族。三世代にわたる謎が明らかになる。町は秘密を守り続ける。';

    expect(synopsisLead(text, 30)).toBe('消えた子供を探す四つの家族。');
  });

  it('counts a full-width character as the room of two', () => {
    const text = '消えた子供を探す四つの家族。三世代にわたる謎が明らかになる。';

    expect(synopsisLead(text, 40)).toBe('消えた子供を探す四つの家族。');
    expect(synopsisLead(text, 80)).toBe(text);
  });

  it('folds line breaks and answers nothing for no synopsis', () => {
    expect(synopsisLead('One line.\n\nAnother.', 200)).toBe('One line. Another.');
    expect(synopsisLead(null, 200)).toBe('');
    expect(synopsisLead('   ', 200)).toBe('');
  });
});
