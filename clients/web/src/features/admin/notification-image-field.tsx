import type { NotificationImage } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Img,
  InputGroup,
  Row,
  Spinner,
  Txt,
} from '@kroma/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { useAsyncAction } from '#web/features/admin/hooks';
import { kromaClient } from '#web/shared/lib/api';

export function NotificationImageField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (url: string) => void }>) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const pick = (url: string) => {
    onChange(url);
    setOpen(false);
  };

  return (
    <Field label={t('admin.notifFieldImage')} minW={0}>
      <InputGroup.Root label={t('admin.notifFieldImage')}>
        <InputGroup.Addon onPress={() => setOpen(true)}>
          <Img
            src={value ? kromaClient().resolveArt(value, 160) : null}
            alt=""
            radius={4}
            style={THUMB}
            background="rgba(255, 255, 255, 0.04)"
            fallback={<Icon name="photo" size={18} color="textDim" />}
          />
        </InputGroup.Addon>
        <InputGroup.Input
          readOnly
          value={imageName(value)}
          placeholder={t('admin.notifImagePick')}
        />
        <InputGroup.Addon align="inline-end">
          {value ? (
            <InputGroup.IconButton
              icon="x"
              label={t('common.delete')}
              onPress={() => onChange('')}
            />
          ) : null}
          <InputGroup.Button label={t('admin.notifImageChoose')} onPress={() => setOpen(true)} />
        </InputGroup.Addon>
      </InputGroup.Root>
      <ImagePickerDialog open={open} onClose={() => setOpen(false)} onPick={pick} />
    </Field>
  );
}

function imageName(value: string): string {
  return value.split('/').at(-1) || value;
}

const THUMB = { width: 20, height: 20 } as const;
const TILE = { width: '100%', aspectRatio: 16 / 9 } as const;

function ImagePickerDialog({
  open,
  onClose,
  onPick,
}: Readonly<{ open: boolean; onClose: () => void; onPick: (url: string) => void }>) {
  const t = useT();
  const { busy, error, run } = useAsyncAction();
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) =>
    run(
      async () => {
        const { imageUrl } = await kromaClient().uploadNotificationImage(file);
        onPick(imageUrl);
      },
      (e) => (e instanceof Error ? e.message : t('error.serverBody')),
    );

  return (
    <Dialog open={open} onClose={onClose} title={t('admin.notifImagePick')} width={720} pad={28}>
      <Box gap={16}>
        <Row gap={10} align="center">
          <Button
            variant="ghost"
            icon="upload"
            label={t('admin.notifUpload')}
            loading={busy}
            onPress={() => fileRef.current?.click()}
          />
        </Row>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
        {error ? (
          <Txt variant="meta" color="danger">
            {error}
          </Txt>
        ) : null}
        <ServerImageGrid onPick={onPick} />
      </Box>
    </Dialog>
  );
}

function ServerImageGrid({ onPick }: Readonly<{ onPick: (url: string) => void }>) {
  const t = useT();
  const [images, setImages] = useState<NotificationImage[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    kromaClient()
      .listNotificationImages()
      .then((listing) => {
        if (active) setImages(listing.images);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <Txt variant="meta" color="danger">
        {t('error.serverBody')}
      </Txt>
    );
  }
  if (!images) {
    return (
      <Box center py={40}>
        <Spinner />
      </Box>
    );
  }
  if (images.length === 0) {
    return (
      <EmptyState
        icon="photo"
        title={t('admin.notifImageEmpty')}
        hint={t('admin.notifImageEmptyHint')}
      />
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {images.map((img) => (
        <button
          key={img.name}
          type="button"
          onClick={() => onPick(img.url)}
          className="min-w-0 rounded-lg text-left hover:opacity-85"
        >
          <Img
            src={kromaClient().resolveArt(img.url, 320)}
            alt={img.name}
            radius={8}
            style={TILE}
            background="rgba(255, 255, 255, 0.04)"
          />
          <span className="mt-1.5 block truncate text-[11px] text-dim">{img.name}</span>
        </button>
      ))}
    </div>
  );
}
