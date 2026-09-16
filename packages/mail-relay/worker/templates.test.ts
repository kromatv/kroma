import { describe, expect, it } from 'vitest';
import { refuseContent } from './content';
import { confirmPage, consentEmail, invalidPage } from './templates';

const VARS = {
  name: 'Home <b>x</b>',
  host: 'kroma.example',
  url: 'https://mail.kroma.tv/confirm/v1.abc',
};

describe('the consent email', () => {
  it('speaks the recipient’s language and names the server', () => {
    const fr = consentEmail('fr', VARS);
    const en = consentEmail('en', VARS);

    expect(fr.subject).toContain('souhaite');
    expect(en.subject).toContain('would like');
    expect(en.text).toContain('Home <b>x</b>');
    expect(en.text).toContain(VARS.url);
  });

  it('escapes the server’s words and leaves no token behind', () => {
    const { html } = consentEmail('en', VARS);

    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Home &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('{');
    expect(html).toContain('cid:logo');
  });

  it('links only to the relay itself', () => {
    const { text, html } = consentEmail('en', VARS);

    expect(refuseContent('https://mail.kroma.tv', text, html)).toBeNull();
  });
});

describe('the confirm page', () => {
  it('asks in the recipient’s language and consents only through a form post', () => {
    const page = confirmPage('fr', {
      name: 'Home',
      host: 'kroma.example',
      address: 'reader@example.test',
      action: '/confirm/v1.abc',
    });

    expect(page).toContain('Autoriser');
    expect(page).toContain('reader@example.test');
    expect(page).toContain('<form method="post" action="/confirm/v1.abc"');
    expect(page).not.toContain('<a ');
  });

  it('has an invalid state that gives nothing away', () => {
    expect(invalidPage('en')).toContain('no longer valid');
    expect(invalidPage('en')).not.toContain('<form');
  });
});
