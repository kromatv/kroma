import { describe, expect, it } from 'vitest';
import { serverAddress } from './server-address';

describe('serverAddress', () => {
  it.each([
    ['nas.local:80', 'http://nas.local/'],
    ['[::1]', 'http://[::1]:4040/'],
    ['192.168.1.50:4040', 'http://192.168.1.50:4040/'],
    [' nas.local ', 'http://nas.local:4040/'],
    ['192.168.1.50', 'http://192.168.1.50:4040/'],
    ['[::1]:4040', 'http://[::1]:4040/'],
    ['http://nas.local', 'http://nas.local/'],
    ['https://media.example.com/kroma', 'https://media.example.com/kroma'],
    ['https://media.example.com:8443/', 'https://media.example.com:8443/'],
  ])('opens %s as %s', (input, expected) => {
    expect(serverAddress(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'not a server',
    'javascript:alert(1)',
    'javascript://example.com',
    'data:text/html,<script>',
    'ftp://nas.local',
    'https://user:secret@nas.local',
    'http://',
    'https://nas.local:bad',
  ])('rejects %s', (input) => {
    expect(serverAddress(input)).toBeNull();
  });
});
