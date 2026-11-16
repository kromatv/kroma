import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import plugin from '../index.mjs';

RuleTester.describe = describe;
RuleTester.it = (name, fn) => it(name, fn);
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
const named = (filename, code) => ({ code, filename });
const broken = (filename, code, messageId) => ({ code, filename, errors: [{ messageId }] });
const component = 'export function Button() { return <button />; }';
const hook = 'export function useFocus() { return 1; }';

tester.run('file-role', plugin.rules['file-role'], {
  valid: [
    named('button.component.tsx', component),
    named('button.component.web.tsx', component),
    named('use-focus.hook.ts', hook),
    named('focus.hook.ts', hook),
    named('colors.ts', 'export function tint() { return 1; }'),
    named('colors.ts', 'export const PALETTE = { red: 1 };'),
    named('types.ts', 'export interface Tone { name: string }'),
    named('session.tsx', `export function SessionProvider() { return <div />; }\n${hook}`),
    named(
      'choice-list.component.tsx',
      'const ChoiceList = { Root, Item };\nexport { ChoiceList };',
    ),
    named('static-view.component.tsx', "export { View as StaticView } from 'react-native';"),
    named('glide-box.component.tsx', 'export const GlideBox = fast ? Jumping : Travelling;'),
    named(
      'avatar.component.tsx',
      'const Avatar = memo(Inner);\nconst TONES = [1];\nexport { Avatar, TONES };',
    ),
    named('index.ts', "export { Button } from './button.component';"),
    named('main.tsx', component),
    named('button.test.tsx', component),
    named('button.fixtures.tsx', component),
    named('button.demo.tsx', component),
    named('vite.config.ts', hook),
    named('legacy.mjs', hook),
    named('shell.d.ts', 'export declare function useShell(): void;'),
  ],
  invalid: [
    broken('button.tsx', component, 'missing'),
    broken('button.web.tsx', component, 'missing'),
    broken('use-focus.ts', hook, 'missing'),
    broken('stage-ratio.ts', 'export const useStageRatio = () => 1;', 'missing'),
    broken(
      'choice-list.tsx',
      'const ChoiceList = { Root, Item };\nexport { ChoiceList };',
      'missing',
    ),
    broken('card.tsx', 'export default function Card() { return <div />; }', 'missing'),
    broken('button.hook.tsx', component, 'missing'),
    broken('colors.hook.ts', 'export function tint() { return 1; }', 'wrong'),
    broken(
      'session.component.tsx',
      `export function SessionProvider() { return <div />; }\n${hook}`,
      'wrong',
    ),
    broken('types.component.tsx', 'export interface Tone { name: string }', 'wrong'),
  ],
});
