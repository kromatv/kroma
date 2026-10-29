import { Icon, type IconName } from '@kromatv/ui/kit';
import logos from './editor-logos.json';

const PATHS: Readonly<Record<string, string>> = logos;
const ALIASES: Readonly<Record<string, string>> = {
  appcode: 'jetbrains',
  codium: 'vscodium',
  emacs: 'gnuemacs',
  gvim: 'vim',
  idea: 'intellijidea',
  mvim: 'vim',
  nvim: 'neovim',
  'notepad++': 'notepadplusplus',
  subl: 'sublimetext',
  sublime_text: 'sublimetext',
  zed: 'zedindustries',
};
const GLYPHS: Readonly<Record<string, IconName>> = {
  automatic: 'wand',
  atom: 'atom',
  'atom beta': 'atom',
  brackets: 'brackets',
  code: 'brand-vscode',
  'code-insiders': 'brand-vscode',
  'code - insiders': 'brand-vscode',
  antigravity: 'rocket',
};

/** The same decorative mark in the menu and the selected editor's trigger. */
export function EditorIcon({ id }: Readonly<{ id: string }>) {
  const key = id.toLowerCase().replace(/(?:64)?(?:\.exe)?$/, '');
  const path = PATHS[ALIASES[key] ?? key];
  if (!path) return <Icon name={GLYPHS[key] ?? 'file-code'} size={18} color="textMuted" />;
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}
