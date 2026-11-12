import { describe, expect, it } from 'vitest';
import { matchText, textRuns } from './text-match';

const found = (text: string, query: string) =>
  textRuns(text, matchText(text, query))
    .filter((run) => run.hit)
    .map((run) => run.text);

const score = (text: string, query: string) => matchText(text, query)?.score ?? -1;

describe('matchText', () => {
  it('answers anything with nothing typed', () => {
    expect(matchText('Réseau', '   ')).toEqual({ score: 0, ranges: [] });
  });

  it('refuses a query whose letters are nowhere', () => {
    expect(matchText('Réseau', 'zzz')).toBeNull();
  });

  it('ignores case and accents on either side', () => {
    expect(score('Réseau', 'RESEAU')).toBe(score('Reseau', 'réseau'));
  });

  describe('how strong a reading is', () => {
    it('puts the whole text above a word in it', () => {
      expect(score('Films', 'films')).toBeGreaterThan(score('Mes films', 'films'));
    });

    it('puts the start of the text above a word later on', () => {
      expect(score('Films récents', 'film')).toBeGreaterThan(score('Mes films', 'film'));
    });

    it('puts a whole word above the start of one', () => {
      expect(score('Mes films', 'films')).toBeGreaterThan(score('Mes filmsx', 'films'));
    });

    it('puts the start of a word above the inside of one', () => {
      expect(score('Mes modules', 'mod')).toBeGreaterThan(score('Commodité', 'mod'));
    });

    it('puts the inside of a word above a typo', () => {
      expect(score('Commodule', 'module')).toBeGreaterThan(score('Modules', 'modlue'));
    });

    it('puts a typo above scattered letters', () => {
      expect(score('Modules', 'modlue')).toBeGreaterThan(score('Modules', 'mdls'));
    });

    it('prefers the shorter text when the reading is the same', () => {
      expect(score('Films récents', 'film')).toBeGreaterThan(
        score('Films récents et anciens', 'film'),
      );
    });
  });

  describe('words', () => {
    it('takes words in any order', () => {
      expect(found('Mises à jour du serveur', 'serveur mises')).toEqual(['Mises', 'serveur']);
    });

    it('slightly prefers the order they are written in', () => {
      expect(score('Mises à jour', 'mises jour')).toBeGreaterThan(
        score('Mises à jour', 'jour mises'),
      );
    });

    it('needs every word to land somewhere', () => {
      expect(matchText('Mises à jour', 'mises zzz')).toBeNull();
    });

    it('does not spend one word on two terms', () => {
      expect(matchText('Modules', 'mod mod')).toBeNull();
    });

    it('does not take an accented letter for the start of a word', () => {
      expect(found('Bibliothèque', 'bibliotheque')).toEqual(['Bibliothèque']);
    });

    it('splits a name on its capitals', () => {
      expect(found('IconButton', 'button')).toEqual(['Button']);
    });
  });

  describe('typos', () => {
    it('forgives two letters swapped', () => {
      expect(found('Réseau', 'resaeu')).toEqual(['Réseau']);
    });

    it('forgives a letter missing', () => {
      expect(found('Modules', 'modles')).toEqual(['Modules']);
    });

    it('forgives a letter too many', () => {
      expect(found('Modules', 'moduules')).toEqual(['Modules']);
    });

    it('forgives a letter wrong', () => {
      expect(found('Modules', 'modulez')).toEqual(['Modules']);
    });

    it('forgives a typo in a word still being typed', () => {
      expect(found('Rechercher', 'rechr')).not.toEqual([]);
    });

    it('does not read a short word as a longer one mistyped', () => {
      expect(matchText('Children', 'chip')).toBeNull();
    });

    it('forgives two in a long word', () => {
      expect(matchText('Bibliothèque', 'biblotheqeu')).not.toBeNull();
    });

    it('forgives none in a short word, where it would match nearly anything', () => {
      expect(matchText('Vue', 'vie')).toBeNull();
    });

    it('does not forgive the first letter', () => {
      expect(matchText('Modules', 'nodules')).toBeNull();
    });
  });

  describe('initials', () => {
    it('reads the first letter of each word', () => {
      expect(found('Mises à jour du serveur', 'mj')).toEqual(['M', 'j']);
    });

    it('does not take a single letter for initials', () => {
      expect(score('Mises à jour', 'm')).toBeGreaterThan(0);
      expect(found('Mises à jour', 'm')).toEqual(['M']);
    });
  });

  describe('run together', () => {
    it('reaches across a separator', () => {
      expect(found('pare-feu', 'parefeu')).toEqual(['pare-feu']);
    });

    it('takes separators in the query as optional', () => {
      expect(score('player-pause', 'player pause')).toBeGreaterThan(0);
    });
  });

  describe('scattered letters', () => {
    it('reaches a name that starts on the first letter', () => {
      expect(found('Modules', 'mdls')).toEqual(['M', 'd', 'l', 's']);
    });

    it('leaves two letters to a prefix or to initials, as they would match nearly anything', () => {
      expect(matchText('Historique de lecture', 'du')).toBeNull();
    });

    it('does not stretch across a whole sentence', () => {
      expect(matchText('Rechercher une mise à jour', 'reseau')).toBeNull();
    });

    it('does not start in the middle of a word and drag a stranger in', () => {
      expect(matchText('Tableau de bord', 'blade')).toBeNull();
    });
  });

  describe('strict', () => {
    it('still finds what the text contains', () => {
      expect(matchText('vpn pare-feu', 'vpn', { strict: true })).not.toBeNull();
    });

    it('still forgives a typo', () => {
      expect(matchText('firewall', 'firewal', { strict: true })).not.toBeNull();
    });

    it('refuses scattered letters', () => {
      expect(matchText('Découvrir', 'du', { strict: true })).toBeNull();
    });

    it('refuses initials', () => {
      expect(matchText('Mises à jour', 'mj', { strict: true })).toBeNull();
    });
  });
});

describe('textRuns', () => {
  it('keeps every letter of the text, in order', () => {
    const runs = textRuns('Réseau', matchText('Réseau', 'sea'));

    expect(runs.map((run) => run.text).join('')).toBe('Réseau');
    expect(runs.map((run) => run.hit)).toEqual([false, true, false]);
  });

  it('says where each stretch starts', () => {
    expect(textRuns('Réseau', matchText('Réseau', 'sea')).map((run) => run.at)).toEqual([0, 2, 5]);
  });

  it('leaves the text whole with no match', () => {
    expect(textRuns('Réseau', null)).toEqual([{ text: 'Réseau', hit: false, at: 0 }]);
  });
});
