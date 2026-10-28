import { IconArrowUpRight } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { serverAddress } from '#site/lib/server-address';
import { m } from '#site/paraglide/messages';

/** Open the address the reader supplies, without guessing their NAS hostname. */
export function ServerAddressForm() {
  const id = useId();
  const [address, setAddress] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const url = serverAddress(address);
        if (!url) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        window.open(url, '_blank', 'noopener,noreferrer');
      }}
    >
      <div>
        <label htmlFor={id} className="mb-2 block text-xs font-medium text-muted">
          {m.download_server_address_label()}
        </label>
        <input
          id={id}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setInvalid(false);
          }}
          placeholder="192.168.1.50:4040"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : `${id}-hint`}
          className="w-full min-w-0 rounded-xl border border-border-strong bg-surface-1 px-4 py-3 text-base text-text placeholder:text-dim"
        />
        {invalid ? (
          <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-accent-text">
            {m.download_server_address_error()}
          </p>
        ) : (
          <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-muted">
            {m.download_server_address_hint()}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-accent bg-accent px-5 py-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
      >
        {m.download_open_web_app()}
        <IconArrowUpRight size={16} stroke={1.75} aria-hidden />
      </button>
    </form>
  );
}
