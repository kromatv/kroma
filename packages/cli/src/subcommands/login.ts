import { defineCommand } from 'citty';
import { exitAfter } from '../exit-after';
import { text } from './args';

export const login = defineCommand({
  meta: { name: 'login', description: 'Sign in to a server once; dev and install use the token.' },
  args: {
    server: {
      type: 'positional',
      required: false,
      description: 'The server URL (default: http://localhost:4040)',
    },
    email: { type: 'string', description: 'Email or username (KROMA_EMAIL)' },
    password: { type: 'string', description: 'Password (KROMA_PASSWORD)' },
  },
  run: ({ args }) =>
    exitAfter(
      import('../commands/login').then((m) =>
        m.loginCommand({
          server: text(args.server),
          email: text(args.email),
          password: text(args.password),
        }),
      ),
    ),
});
