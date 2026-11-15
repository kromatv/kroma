import { afterEach, describe, expect, it } from 'vitest';
import { openChannel } from './host';
import { saveMessage } from './message';

afterEach(() => openChannel(null));

describe('saving a message with no dev server to write it', () => {
  it('says the server could not be reached', async () => {
    const refused = await saveMessage(
      { scope: null, locale: 'en', key: 'nav.home' },
      { 'nav.home': 'House' },
    );

    expect(refused).toBe('Could not reach the dev server.');
  });
});
