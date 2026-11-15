import { afterEach, describe, expect, it } from 'vitest';
import { removeSets, setOf } from './fixture.ts';
import { readSource } from './status.ts';
import { namedIn, unusedMessages } from './usage.ts';

afterEach(removeSets);

function unused(code: string, messages: Record<string, string>): string[] {
  const set = setOf({ 'fr/all.json': messages }, { source: 'fr' }, 'flat');
  return unusedMessages(
    readSource({ ...set, dir: `${set.dir}/fr`, project: { source: 'all' } }),
    namedIn([code]),
  );
}

describe('unusedMessages', () => {
  it('lists the messages no string names', () => {
    expect(unused("t('nav.home')", { 'nav.home': 'a', 'nav.back': 'b' })).toEqual(['nav.back']);
  });

  it('counts a plural message as named through its base', () => {
    expect(
      unused("t('cart.items', { count })", { 'cart.items': 'a', 'cart.items_one': 'b' }),
    ).toEqual([]);
  });

  it('counts every key a template or a format string is the head of', () => {
    const messages = { 'genre.drama': 'a', 'genre.comedy': 'b', 'jobs.scan': 'c', 'nav.home': 'd' };

    expect(unused('t(`genre.${slug}`); format!("jobs.{kind}")', messages)).toEqual(['nav.home']);
  });

  it('counts the keys below a literal the code builds on', () => {
    expect(
      unused('"email.reset"', { 'email.reset.subject': 'a', 'email.verify.subject': 'b' }),
    ).toEqual(['email.verify.subject']);
  });

  it('leaves the language names out, which no code names by key', () => {
    expect(unused('', { 'lang.fr': 'Français' })).toEqual([]);
  });
});
