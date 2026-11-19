import { EngineField } from '@kromatv/client/modules';
import { expect, it } from 'vitest';
import { fieldIcon } from './field-icon';

const field = (over: Record<string, unknown>) =>
  EngineField.parse({ key: 'note', label: 'Note', type: 'string', ...over });

it('puts a lock on a secret, whatever its key', () => {
  expect(fieldIcon(field({ key: 'password', secret: true }))).toBe('lock');
  expect(fieldIcon(field({ key: 'url', secret: true }))).toBe('lock');
});

it('gives an address and a user name the glyph they are known by', () => {
  expect(fieldIcon(field({ key: 'url' }))).toBe('link');
  expect(fieldIcon(field({ key: 'username' }))).toBe('user');
});

it('gives a field it does not know no glyph', () => {
  expect(fieldIcon(field({}))).toBeUndefined();
});
