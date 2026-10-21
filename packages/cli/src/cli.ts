#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty';
import { create } from './subcommands/create';
import { dev } from './subcommands/dev';
import { build } from './subcommands/build';
import { check } from './subcommands/check';
import { install } from './subcommands/install';
import { login } from './subcommands/login';
import { plan } from './subcommands/plan';
import { cargo } from './subcommands/cargo';
import { registry } from './subcommands/registry';
import { serve } from './subcommands/serve';
import { release } from './subcommands/release';

const main = defineCommand({
  meta: { name: 'kroma', description: 'Build KROMA modules.' },
  subCommands: { create, dev, build, check, install, login, plan, cargo, registry, serve, release },
});

runMain(main);
