// @vitest-environment jsdom

import type { Translate, TVars } from '@kroma/core';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { msg } from './message';
import { useForm } from './use-form';

afterEach(cleanup);

const Credentials = z.object({
  email: z
    .string()
    .min(1, msg('form.required'))
    .pipe(z.email(msg('form.email'))),
  password: z.string().min(8, msg('form.tooShort', { min: 8 })),
  remember: z.boolean(),
});

const catalog: Record<string, string> = {
  'form.required': 'This one is required.',
  'form.email': 'That does not look like an email address.',
  'form.tooShort': 'Use at least {min} characters.',
};

const t = ((key: string, vars?: TVars) =>
  (catalog[key] ?? key).replace(/\{(\w+)}/g, (whole, name: string) =>
    vars && name in vars ? String(vars[name]) : whole,
  )) as Translate;

function Probe({
  onSubmit,
  translate,
}: Readonly<{
  onSubmit?: (values: z.infer<typeof Credentials>) => void | Promise<void>;
  translate?: Translate;
}>) {
  const form = useForm({
    schema: Credentials,
    defaultValues: { email: '', password: '', remember: false },
    onSubmit,
    t: translate,
  });
  const email = form.field('email');
  const password = form.field('password');
  const remember = form.toggle('remember');
  return (
    <div>
      <input
        aria-label="email"
        value={email.root.value}
        onChange={(e) => email.root.onValueChange(e.target.value)}
      />
      <input
        aria-label="password"
        value={password.root.value}
        onChange={(e) => password.root.onValueChange(e.target.value)}
      />
      <input
        aria-label="remember"
        type="checkbox"
        checked={remember.checked}
        onChange={(e) => remember.onChange(e.target.checked)}
      />
      <output aria-label="email-error">{email.root.error ?? ''}</output>
      <output aria-label="password-error">{password.root.error ?? ''}</output>
      <output aria-label="form-error">{form.error ?? ''}</output>
      <output aria-label="state">
        {form.submitting ? 'submitting' : ''}
        {form.submitted ? 'submitted' : ''}
      </output>
      <button type="button" onClick={form.submit}>
        submit
      </button>
      <button type="button" onClick={() => form.reset()}>
        reset
      </button>
      <button type="button" onClick={() => form.reset({ email: 'seeded@example.org' })}>
        reset seeded
      </button>
      <button type="button" onClick={() => form.setError('email', 'form.required')}>
        blame email
      </button>
      <button type="button" onClick={() => form.setError('email')}>
        clear email
      </button>
    </div>
  );
}

const shown = (label: string) => screen.getByLabelText(label).textContent;
const entry = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = async (label: string, text: string) => {
  const input = entry(label);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const press = async (name: string) => {
  await act(async () => {
    screen.getByText(name).click();
  });
};

describe('useForm', () => {
  it('stays quiet until the first submit', async () => {
    render(<Probe translate={t} />);
    await type('email', 'nope');
    expect(shown('email-error')).toBe('');

    await press('submit');
    expect(shown('email-error')).toBe('That does not look like an email address.');
  });

  it('translates a message and fills the vars the schema gave it', async () => {
    render(<Probe translate={t} />);
    await press('submit');
    expect(shown('password-error')).toBe('Use at least 8 characters.');
  });

  it('shows the first failure of a field, not every one', async () => {
    render(<Probe translate={t} />);
    await press('submit');
    expect(shown('email-error')).toBe('This one is required.');
  });

  it('goes live once submitted: an error clears as the field is fixed', async () => {
    render(<Probe translate={t} />);
    await press('submit');
    expect(shown('password-error')).toBe('Use at least 8 characters.');

    await type('password', 'hunter2!');
    expect(shown('password-error')).toBe('');
  });

  it('hands onSubmit the schema OUTPUT, only when everything passes', async () => {
    const onSubmit = vi.fn();
    render(<Probe onSubmit={onSubmit} translate={t} />);

    await press('submit');
    expect(onSubmit).not.toHaveBeenCalled();

    await type('email', 'ada@example.org');
    await type('password', 'hunter2!');
    await press('submit');

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'ada@example.org',
      password: 'hunter2!',
      remember: false,
    });
    expect(shown('state')).toBe('submitted');
  });

  it('turns a throw from onSubmit into the form-level error', async () => {
    render(
      <Probe
        translate={t}
        onSubmit={() => {
          throw new Error('form.required');
        }}
      />,
    );
    await type('email', 'ada@example.org');
    await type('password', 'hunter2!');
    await press('submit');

    expect(shown('form-error')).toBe('This one is required.');
    expect(shown('state')).toBe('');
  });

  it('drops `submitted` the moment anything is edited again', async () => {
    render(<Probe translate={t} />);
    await type('email', 'ada@example.org');
    await type('password', 'hunter2!');
    await press('submit');
    expect(shown('state')).toBe('submitted');

    await type('password', 'hunter2!!');
    expect(shown('state')).toBe('');
  });

  it('binds a boolean through toggle()', async () => {
    const onSubmit = vi.fn();
    render(<Probe onSubmit={onSubmit} translate={t} />);
    await act(async () => entry('remember').click());
    await type('email', 'ada@example.org');
    await type('password', 'hunter2!');
    await press('submit');

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remember: true }));
  });

  it('reset() clears the errors and goes quiet again', async () => {
    render(<Probe translate={t} />);
    await press('submit');
    expect(shown('email-error')).not.toBe('');

    await press('reset');
    expect(shown('email-error')).toBe('');
    expect(entry('email').value).toBe('');

    await type('email', 'nope');
    expect(shown('email-error')).toBe('');
  });

  it('shows the message as written when no translator is given', async () => {
    render(<Probe />);
    await press('submit');
    expect(shown('password-error')).toBe('form.tooShort');
  });

  it('falls back to a generic message when the throw carries none', async () => {
    render(
      <Probe
        translate={t}
        onSubmit={() => {
          throw new Error('');
        }}
      />,
    );
    await type('email', 'ada@example.org');
    await type('password', 'hunter2!');
    await press('submit');
    expect(shown('form-error')).toBe('form.submitFailed');
  });

  it('reads a thrown string as the message it is', async () => {
    render(
      <Probe
        translate={t}
        onSubmit={() => {
          throw 'form.required';
        }}
      />,
    );
    await type('email', 'ada@example.org');
    await type('password', 'hunter2!');
    await press('submit');
    expect(shown('form-error')).toBe('This one is required.');
  });

  it('setError blames a field by hand, and clears it again', async () => {
    render(<Probe translate={t} />);
    await press('blame email');
    expect(shown('email-error')).toBe('This one is required.');
    await press('clear email');
    expect(shown('email-error')).toBe('');
  });

  it('reset(values) seeds the fields it names and defaults the rest', async () => {
    render(<Probe translate={t} />);
    await type('email', 'ada@example.org');
    await type('password', 'hunter2!');
    await press('reset seeded');
    expect(entry('email').value).toBe('seeded@example.org');
    expect(entry('password').value).toBe('');
  });
});

describe('overlapping validations', () => {
  it('lets the newest answer win when an older one lands late', async () => {
    const pending: Array<(result: unknown) => void> = [];
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () =>
          new Promise((resolve) => {
            pending.push(resolve);
          }),
      },
    } as never;

    const { result } = renderHook(() =>
      useForm({ schema, defaultValues: { code: '' } as Record<string, unknown> }),
    );

    await act(async () => {
      void result.current.submit();
    });
    await act(async () => {
      result.current.setValue('code', 'ab');
    });
    expect(pending).toHaveLength(2);

    await act(async () => {
      pending[1]?.({ issues: [{ message: 'newest' }] });
      pending[0]?.({ issues: [{ message: 'oldest' }] });
    });
    expect(result.current.error).toBe('newest');
  });
});

describe('a check that blames no single field', () => {
  const Passwords = z
    .object({ password: z.string(), confirm: z.string() })
    .refine((v) => v.password === v.confirm, msg('form.mismatch'));

  function PairProbe() {
    const form = useForm({
      schema: Passwords,
      defaultValues: { password: 'hunter2!', confirm: 'hunter3!' },
    });
    return (
      <div>
        <output aria-label="form-error">{form.error ?? ''}</output>
        <button type="button" onClick={form.submit}>
          submit
        </button>
      </div>
    );
  }

  it('lands on the form rather than on a field', async () => {
    render(<PairProbe />);
    await press('submit');
    expect(shown('form-error')).toBe('form.mismatch');
  });
});
