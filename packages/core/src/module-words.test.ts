import { expect, it } from 'vitest';
import { moduleWords } from './module-words';

const remote = {
  name: 'Remote access',
  description: 'Public HTTPS access to this server',
  tagline: 'Watch away from home.',
  translations: {
    fr: { name: 'Accès à distance', tagline: 'Regardez loin de chez vous.' },
    'pt-BR': { name: 'Acesso remoto' },
  },
};

it('reads a module in the language asked for', () => {
  expect(moduleWords(remote, 'fr')).toEqual({
    name: 'Accès à distance',
    description: 'Public HTTPS access to this server',
    tagline: 'Regardez loin de chez vous.',
  });
});

it('reads a regional language from the language it belongs to', () => {
  expect(moduleWords(remote, 'fr-CH').name).toBe('Accès à distance');
  expect(moduleWords(remote, 'pt-BR').name).toBe('Acesso remoto');
});

it('reads a module that does not speak the language in English', () => {
  expect(moduleWords(remote, 'de')).toEqual({
    name: 'Remote access',
    description: 'Public HTTPS access to this server',
    tagline: 'Watch away from home.',
  });
});

it('reads a module that gives no sentence and no translation in its own English words', () => {
  const plain = { name: 'Trailers', description: null };

  expect(moduleWords(plain, 'fr')).toEqual({ name: 'Trailers', description: '', tagline: null });
});
