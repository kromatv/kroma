import { tvShellLegacyConfig } from '@kroma/bundler/shell';
import { target } from './tv.target.ts';

export default tvShellLegacyConfig(import.meta.url, target);
