// Shared building blocks for the account-creation forms. Both the in-app
// registration screen (`auth-forms.tsx`) and the public `/join` invite page
// render the exact same avatar tile + email/username/password inputs, so that
// block lives here once and is driven by controlled props.

import { useT } from '@kroma/ui';
import { Field } from '@kroma/ui/kit';
import { IconPlus } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { avatarGradient, initials } from '#web/features/accounts/user-avatar';
import { Image } from '#web/shared/ui';

export type RegisterValues = Readonly<{ email: string; username: string; password: string }>;

/** Avatar picker tile + the three registration inputs, controlled by the parent
 * form. The object-URL preview and hidden file input are managed internally; the
 * chosen File is reported through `onAvatar`. */
export function RegisterFields({
  values,
  onChange,
  onAvatar,
}: Readonly<{
  values: RegisterValues;
  onChange: (values: RegisterValues) => void;
  onAvatar: (avatar: File | null) => void;
}>) {
  const t = useT();
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { email, username, password } = values;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickFile(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    onAvatar(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group relative h-28 w-28 overflow-hidden rounded-xl focus:outline-none"
        aria-label={t('auth.chooseAvatar')}
      >
        {preview ? (
          <Image src={preview} fit="cover" fill />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-white/85"
            style={{ background: avatarGradient(username || email || 'new') }}
          >
            {username.trim() ? (
              <span className="font-display text-[40px] font-bold">{initials(username)}</span>
            ) : (
              <IconPlus size={34} stroke={1.6} />
            )}
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
          {t('common.photo')}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {/* `md` against the app's `sm` default, matching the sign-in form these
          sit beside; see the note in auth-forms.tsx. */}
      <Field
        w="100%"
        size="md"
        label={t('auth.email')}
        hideLabel
        type="email"
        icon="mail"
        placeholder={t('auth.email')}
        value={email}
        onChange={(v) => onChange({ ...values, email: v })}
      />
      <Field
        w="100%"
        size="md"
        label={t('auth.username')}
        hideLabel
        icon="user"
        placeholder={t('auth.username')}
        value={username}
        onChange={(v) => onChange({ ...values, username: v })}
        entry={{ autoComplete: 'username' }}
      />
      <Field
        w="100%"
        size="md"
        label={t('auth.passwordHint')}
        hideLabel
        type="password"
        icon="lock"
        placeholder={t('auth.passwordHint')}
        value={password}
        onChange={(v) => onChange({ ...values, password: v })}
        entry={{ autoComplete: 'new-password' }}
      />
    </>
  );
}
