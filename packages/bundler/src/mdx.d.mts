import type { Plugin } from 'vite';

export declare const MDX_OPTIONS: Record<string, unknown>;
export declare function kromaMdx(): Plugin;
export declare function compileMdx(value: string, path: string): Promise<string>;
