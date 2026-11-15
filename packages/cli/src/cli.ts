#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty';
import { audit } from './subcommands/audit';
import { create } from './subcommands/create';
import { dev } from './subcommands/dev';
import { build } from './subcommands/build';
import { check } from './subcommands/check';
import { install } from './subcommands/install';
import { login } from './subcommands/login';
import { cargo } from './subcommands/cargo';
import { registry } from './subcommands/registry';
import { serve } from './subcommands/serve';
import { release } from './subcommands/release';
import { i18n } from './subcommands/i18n';

const main = defineCommand({
  meta: { name: 'kroma', description: 'Build KROMA modules.' },
  subCommands: {
    create,
    dev,
    build,
    check,
    audit,
    i18n,
    install,
    login,
    cargo,
    registry,
    serve,
    release,
  },
});

await runMain(main);
