// @vitest-environment jsdom
import { StoreModule } from '@kromatv/client/modules';
import { expect, it } from 'vitest';
import { offerReach, offerWords } from '#web/features/setup/module-offer-words';
import { englishT } from '#web/shared/lib/module-permissions.fixture';

const offer = (row: Record<string, unknown> = {}) => ({
  module: StoreModule.parse({
    id: 'tv.test.remote',
    name: 'Remote access',
    version: '1.0.0',
    description: 'Public HTTPS access',
    tagline: 'Watch away from home.',
    translations: { fr: { name: 'Accès à distance', tagline: 'Regardez loin de chez vous.' } },
    library: false,
    dependencies: {},
    optionalDependencies: {},
    contributes: [],
    consumes: [],
    updateAvailable: false,
    compatible: true,
    source: 'Official',
    ...row,
  }),
  needs: [],
  installed: false,
});

it('offers a module by its own sentence, in the language of the owner', () => {
  expect(offerWords(offer(), 'fr')).toEqual({
    name: 'Accès à distance',
    sentence: 'Regardez loin de chez vous.',
  });
  expect(offerWords(offer(), 'en').sentence).toBe('Watch away from home.');
});

it('offers a module that gives no sentence by its description', () => {
  expect(offerWords(offer({ tagline: null, translations: null }), 'fr').sentence).toBe(
    'Public HTTPS access',
  );
});

it('says why this server cannot take a module instead of what it does', () => {
  const refused = offer({ compatible: false, reason: 'needs a newer server' });

  expect(offerWords(refused, 'en').sentence).toBe('needs a newer server');
});

it('names each kind of access an offer may reach', () => {
  const reaching = offer({ permissions: { net: { discovery: ['mdns'] }, run: ['cloudflared'] } });

  expect(offerReach(reaching, englishT())).toEqual(['Programs run on the server', 'Local network']);
});

it('names nothing for a module that does not say what it reaches', () => {
  expect(offerReach(offer(), englishT())).toEqual([]);
});
