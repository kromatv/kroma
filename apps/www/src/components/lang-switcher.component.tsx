import { IconCheck, IconChevronDown, IconLanguage } from '@tabler/icons-react';
import { type RefObject, useEffect, useRef } from 'react';
import { type Lang, locales, localizePath, useCanonicalPath, useLang } from '#site/lib/i18n';
import { type LanguageChoice, languageChoices } from '#site/lib/language-choices';
import { m } from '#site/paraglide/messages';

type Placement = 'popover' | 'inline';

const PANEL: Record<Placement, { panel: string; row: string }> = {
  popover: {
    panel:
      'absolute right-0 top-11 z-50 w-72 rounded-2xl border border-border-strong bg-surface-1 p-2 shadow-pop',
    row: 'rounded-lg',
  },
  inline: { panel: 'mt-1 rounded-lg border border-border bg-surface-2 p-1', row: 'rounded' },
};

function Flag({ src, size }: Readonly<{ src: string | undefined; size: 4 | 5 }>) {
  const box = size === 4 ? 'size-4' : 'size-5';
  if (!src) {
    return (
      <span className={`${box} flex shrink-0 items-center justify-center rounded bg-wash`}>
        <IconLanguage size={size === 4 ? 12 : 14} stroke={1.75} aria-hidden />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={size * 4}
      height={size * 4}
      className={`${box} shrink-0 rounded outline outline-1 -outline-offset-1 outline-border`}
    />
  );
}

function closeDetails(details: HTMLDetailsElement | null): HTMLDetailsElement | null {
  if (!details?.open) {
    return null;
  }
  details.open = false;
  return details;
}

function useLightDismiss(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node && ref.current?.contains(event.target))) {
        closeDetails(ref.current);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDetails(ref.current)?.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref]);
}

interface RowProps {
  choice: LanguageChoice<Lang>;
  path: string;
  active: boolean;
  radius: string;
}

function Row({ choice, path, active, radius }: Readonly<RowProps>) {
  return (
    <a
      href={localizePath(path, choice.lang)}
      hrefLang={choice.lang}
      lang={choice.lang}
      aria-current={active ? 'true' : undefined}
      className={`flex items-center gap-3 ${radius} px-2.5 py-2 transition-colors hover:bg-wash focus-visible:bg-wash`}
    >
      <Flag src={choice.flag} size={5} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-text">{choice.ownName}</span>
        {choice.name === choice.ownName ? null : (
          <span className="truncate text-xs text-muted">{choice.name}</span>
        )}
      </span>
      {active ? (
        <IconCheck size={16} stroke={2.25} className="shrink-0 text-accent-text" aria-hidden />
      ) : null}
    </a>
  );
}

/** The language the page is in, opening the list of every language the site is
 *  written in: each one's flag, its name for itself and its name in the
 *  language being read. Every row is a link to the same page in that language,
 *  so it works before the page has run a line of script. */
export function LangSwitcher({
  className,
  placement = 'popover',
}: Readonly<{ className?: string; placement?: Placement }>) {
  const active = useLang();
  const path = useCanonicalPath();
  const ref = useRef<HTMLDetailsElement>(null);
  useLightDismiss(ref);
  const choices = languageChoices(locales, active);
  const current = choices[0];
  return (
    <details ref={ref} className={['relative', className].filter(Boolean).join(' ')}>
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border px-2.5 text-sm font-semibold text-text transition-colors hover:bg-wash [&::-webkit-details-marker]:hidden">
        <span className="sr-only">{m.lang_label()}: </span>
        <Flag src={current?.flag} size={4} />
        <span lang={active}>{current?.ownName}</span>
        <IconChevronDown size={14} stroke={2} className="text-muted" aria-hidden />
      </summary>
      <nav aria-label={m.lang_label()} className={PANEL[placement].panel}>
        {choices.map((choice) => (
          <Row
            key={choice.lang}
            choice={choice}
            path={path}
            active={choice.lang === active}
            radius={PANEL[placement].row}
          />
        ))}
      </nav>
    </details>
  );
}
