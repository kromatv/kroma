// The device picker, as an imperative callable: `const id = await castPicker()`.
//
// A callable rather than a popover because the answer is what every caller
// actually wants - "which screen" - and none of them should have to hold open
// state to ask. Its single root is mounted in the app shell.

import { Modal } from '@kroma/admin-kit';
import { useCast, useT } from '@kroma/ui';
import { Icon } from '@kroma/ui/kit';
import { createCallable } from 'react-call';

export interface CastPickerProps {
  offerLocal?: boolean;
}

// `undefined` = dismissed · `null` = this device · a string = that receiver.
type Picked = string | null | undefined;

export const CastPicker = createCallable<CastPickerProps, Picked>(({ call, offerLocal }) => {
  const t = useT();
  const { receivers, active } = useCast();
  return (
    <Modal title={t('cast.title')} onClose={() => call.end(undefined)}>
      <div className="flex flex-col gap-1">
        {offerLocal ? (
          <DeviceRow
            icon="device-desktop"
            name={t('cast.thisDevice')}
            detail={t('cast.playHere')}
            selected={!active}
            onClick={() => call.end(null)}
          />
        ) : null}
        {receivers.map((r) => (
          <DeviceRow
            key={r.id}
            icon="device-tv"
            name={r.name}
            detail={
              r.nowPlaying
                ? (r.nowPlaying.item.metadata?.title ?? r.nowPlaying.item.title)
                : `${r.username} · ${t('cast.idle')}`
            }
            selected={active?.id === r.id}
            onClick={() => call.end(r.id)}
          />
        ))}
        {receivers.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[14px] text-text">{t('cast.noDevices')}</p>
            <p className="mt-1 text-[13px] text-dim">{t('cast.noDevicesHint')}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
});

function DeviceRow({
  icon,
  name,
  detail,
  selected,
  onClick,
}: Readonly<{
  icon: 'device-tv' | 'device-desktop';
  name: string;
  detail: string;
  selected: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5"
    >
      <Icon name={icon} size={22} stroke={1.8} color={selected ? 'accent' : 'text'} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[14px] font-semibold ${selected ? 'text-accent' : 'text-text'}`}
        >
          {name}
        </span>
        <span className="block truncate text-[12px] text-dim">{detail}</span>
      </span>
      {selected ? <Icon name="check" size={18} stroke={2.4} color="accent" /> : null}
    </button>
  );
}

/** Ask which screen to play on. Resolves the receiver id, `null` for "this
 * device", or `undefined` when dismissed. */
export const castPicker = (props: CastPickerProps = {}): Promise<Picked> => CastPicker.call(props);
