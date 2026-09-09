import { tvShellConfig } from '@kromatv/bundler/shell';
import type { ConfigEnv, UserConfig } from 'vite';
import { target } from './tv.target.ts';

const shell = tvShellConfig(import.meta.url, target);

export default function tvWebConfig(env: ConfigEnv): UserConfig {
  return {
    ...shell(env),
    base: '/',
  };
}
