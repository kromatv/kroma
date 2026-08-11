import { tvShellConfig } from '@kroma/bundler/shell';
import { target } from './tv.target.ts';

export default tvShellConfig(import.meta.url, target);
