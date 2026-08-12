import type { NotificationImage } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  color,
  Dialog,
  EmptyState,
  Field,
  Grid,
  Icon,
  Img,
  InputGroup,
  Row,
  Spinner,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

// A file input is a handle for the button beside it, never a control a reader
// sees; a tile is a bare press target. Neither `display: none` nor a button
// reset has a React Native spelling.
const OFFSCREEN: CSSProperties = { display: 'none' };

const TILE_BUTTON: CSSProperties = {
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: 0,
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
};

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
    <Field.Root label={t('admin.notifFieldImage')} minW={0}>
      <InputGroup.Root label={t('admin.notifFieldImage')}>
        <InputGroup.Addon onPress={() => setOpen(true)}>
          <Img
            src={value ? kromaClient().resolveArt(value, 160) : null}
            alt=""
            radius={4}
            style={THUMB}
            background={WASH}
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
    </Field.Root>
  );
}

function imageName(value: string): string {
  return value.split('/').at(-1) || value;
}

const WASH = color('tint/4');

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
    <Dialog.Root
      open={open}
      onClose={onClose}
      title={t('admin.notifImagePick')}
      width="xl"
      pad={28}
    >
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
          style={OFFSCREEN}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
        {error ? (
          <Text variant="meta" color="danger">
            {error}
          </Text>
        ) : null}
        <ServerImageGrid onPick={onPick} />
      </Box>
    </Dialog.Root>
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
      <Text variant="meta" color="danger">
        {t('error.serverBody')}
      </Text>
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
      <EmptyState.Root icon="photo">
        <EmptyState.Title>{t('admin.notifImageEmpty')}</EmptyState.Title>
        <EmptyState.Hint>{t('admin.notifImageEmptyHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  return (
    <Grid min={140} gap={12}>
      {images.map((img) => (
        <button key={img.name} type="button" onClick={() => onPick(img.url)} style={TILE_BUTTON}>
          <Img
            src={kromaClient().resolveArt(img.url, 320)}
            alt={img.name}
            radius={8}
            style={TILE}
            background={WASH}
          />
          <Text variant="meta" color="textDim" lines={1} mt={6}>
            {img.name}
          </Text>
        </button>
      ))}
    </Grid>
  );
}
