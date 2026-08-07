// The registry site: hero with the copyable registry URL, a filterable grid
// of module cards, and nothing else. Data arrives via `loadCatalog` (injected
// by the worker in production, fetched in dev).

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type Catalog, depList, loadCatalog, type ModuleEntry } from './catalog';

const REPO = 'maxscharwath/kroma';

const mb = (n?: number | null) => {
  if (!n) return '';
  if (n < 1048576) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

function CopyButton({ text }: Readonly<{ text: string }>) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 cursor-pointer rounded-lg bg-amber px-3.5 py-1.5 text-[12.5px] font-bold text-amber-ink transition hover:brightness-105"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Chip({
  tone = 'dim',
  children,
}: Readonly<{ tone?: 'dim' | 'mint'; children: ReactNode }>) {
  const color = tone === 'mint' ? 'bg-mint/10 text-mint' : 'bg-white/5 text-ink-dim';
  return (
    <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${color}`}>
      {children}
    </span>
  );
}

function ModuleCard({ m }: Readonly<{ m: ModuleEntry }>) {
  const deps = depList(m.dependsOn);
  const targets = (m.artifacts ?? []).map((a) => a.target || 'universal');
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4.5 transition hover:-translate-y-px hover:border-line-strong">
      <div className="flex items-center gap-3">
        {m.icon ? (
          <img
            src={m.icon}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-xl bg-surface-2" />
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight">{m.name}</h3>
          <code className="font-mono text-[11px] text-ink-dim">{m.id}</code>
        </div>
        <span className="ml-auto shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink-muted">
          v{m.version}
        </span>
      </div>
      {m.description && <p className="line-clamp-3 text-[13px] text-ink-muted">{m.description}</p>}
      <div className="flex flex-wrap gap-1.5">
        {targets.map((t) => (
          <Chip key={t}>{t}</Chip>
        ))}
        {(m.provides ?? []).map((c) => (
          <Chip key={`${c.kind}:${c.id}`} tone="mint">
            {c.kind}:{c.id}
          </Chip>
        ))}
        {m.library && <Chip>library</Chip>}
      </div>
      {deps.length > 0 && <p className="text-[11.5px] text-ink-dim">needs {deps.join(', ')}</p>}
      <p className="mt-auto text-[11.5px] text-ink-dim">
        {m.minServer ? `server ≥ ${m.minServer}` : ''}
        {m.minServer && m.size ? ' · ' : ''}
        {mb(m.size)}
      </p>
    </article>
  );
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch(() => setFailed(true));
  }, []);

  const all = catalog?.modules ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((m) => `${m.id} ${m.name} ${m.description ?? ''}`.toLowerCase().includes(q));
  }, [all, query]);

  const registryUrl = `${window.location.origin}/modules.json`;
  const updated = catalog?.generatedAt ? ` · updated ${catalog.generatedAt.slice(0, 10)}` : '';
  let status = 'loading catalog';
  if (catalog) status = `${all.length} module${all.length === 1 ? '' : 's'} available${updated}`;
  else if (failed) status = 'catalog unavailable';

  return (
    <div className="mx-auto max-w-265 px-5.5 pb-16 pt-10 text-ink antialiased">
      <header className="flex items-center gap-3">
        <img src="/favicon.svg" alt="KROMA" className="h-7.5 w-7.5" />
        <span className="text-[17px] font-extrabold tracking-wide">KROMA</span>
        <span className="rounded-md bg-amber px-1.75 py-0.75 text-[9.5px] font-extrabold tracking-[.14em] text-amber-ink">
          MODULES
        </span>
        <a
          href={`https://github.com/${REPO}`}
          className="ml-auto text-[13px] text-ink-dim transition hover:text-ink"
        >
          GitHub
        </a>
      </header>

      <h1 className="mb-3.5 mt-13 text-[clamp(30px,5.4vw,44px)] font-extrabold leading-[1.08] tracking-tight">
        The module registry for <span className="text-amber">KROMA</span>
      </h1>
      <p className="mb-6.5 max-w-155 text-ink-muted">
        Native modules for your KROMA server: downloads, indexers, VPN, transcription and more.
        Browse here; install and update from <b>Admin&nbsp;→&nbsp;Modules</b> with checksums
        verified end to end.
      </p>
      <div className="flex max-w-155 items-center gap-2.5 rounded-xl border border-line-strong bg-surface py-2.5 pl-4 pr-2.5">
        <code className="flex-1 break-all font-mono text-[13px] text-ink-muted">{registryUrl}</code>
        <CopyButton text={registryUrl} />
      </div>
      <p className="mt-2.5 text-[12.5px] text-ink-dim">
        Paste it as a registry URL, or just use{' '}
        <code className="font-mono">{window.location.host}</code>: KROMA discovers the catalog from
        this page.
      </p>

      <div className="mb-4.5 mt-11 flex flex-wrap items-center justify-between gap-3.5">
        <span className="text-[13px] font-semibold uppercase tracking-wider text-ink-dim">
          {status}
        </span>
        {all.length > 3 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter modules"
            autoComplete="off"
            className="w-60 rounded-[10px] border border-line-strong bg-surface px-3.5 py-2 text-[13.5px] text-ink outline-none transition focus:border-amber/50"
          />
        )}
      </div>

      {failed ? (
        <p className="py-10 text-ink-dim">
          The catalog could not be loaded. The JSON lives at{' '}
          <a className="underline" href="/modules.json">
            /modules.json
          </a>
          {'.'}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {shown.map((m) => (
            <ModuleCard key={m.id} m={m} />
          ))}
          {catalog && all.length === 0 && (
            <p className="py-10 text-ink-dim">No modules published yet.</p>
          )}
          {catalog && all.length > 0 && shown.length === 0 && (
            <p className="py-10 text-ink-dim">No module matches this filter.</p>
          )}
        </div>
      )}

      <footer className="mt-14 flex flex-wrap gap-x-4.5 gap-y-2 border-t border-line pt-5.5 text-[13px] text-ink-dim">
        <span>
          Served live from{' '}
          <a
            className="text-ink-muted transition hover:text-ink"
            href={`https://github.com/${REPO}/releases`}
          >
            github.com/{REPO}
          </a>
        </span>
        <span>
          JSON:{' '}
          <a className="text-ink-muted transition hover:text-ink" href="/modules.json">
            modules.json
          </a>
        </span>
        <a className="text-ink-muted transition hover:text-ink" href="https://kroma.tv">
          kroma.tv
        </a>
      </footer>
    </div>
  );
}
