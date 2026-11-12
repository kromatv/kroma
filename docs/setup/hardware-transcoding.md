# Hardware transcoding

Most of the time, KROMA sends a video file to the screen exactly as it is. This
is called direct play, and it costs the server almost nothing. KROMA converts a
video only when the screen cannot play it, for example an HEVC film on a TV
that only plays H.264, or a 4K film on a device that stops at 1080p.

That conversion is the one part of KROMA that needs real processing power. On a
NAS, one 4K film converted on the processor can use all of it. A graphics chip
does the same work at a few percent of the processor. This page shows how to
give KROMA access to it.

## What KROMA can use

| Hardware | Name in the log | Where |
| --- | --- | --- |
| Intel graphics, Quick Sync | `qsv` or `vaapi` | most Intel processors, including Intel Synology models |
| AMD graphics, VA-API | `vaapi` | Linux computers that run KROMA outside Docker, with the AMD driver installed |
| NVIDIA graphics cards | `nvenc` | computers with an NVIDIA card |
| Apple silicon and Intel Macs | `videotoolbox` | macOS, when KROMA runs outside Docker |

KROMA tries each one at startup and only uses it if it can convert a test
frame. A chip that is present but that KROMA cannot open counts as missing.

## Check what KROMA uses

Every start, the server log says where conversions run:

```
INFO video re-encodes run on hardware accel="vaapi" reason=h264_vaapi encoded a test frame
```

or, when it found nothing it could use, a line that starts with
`video re-encodes run on the CPU`. Its `reason` names what each method lacked,
for example:

```
WARN video re-encodes run on the CPU reason=every listed device refused a test encode (qsv: /dev/dri/renderD128 is not readable by this user ...)
```

Read the log in KROMA under **Server** > **Logs**, with
`docker compose logs kroma` in Docker, or in
`/var/packages/kroma/var/kroma.log` on the Synology package.

## Synology package

The package sets it up on Intel models. There is nothing to do. See
[Synology: hardware transcoding](synology.md#hardware-transcoding) for the
models that have no graphics chip, or no driver for it.

## Docker with Intel graphics

KROMA needs three things, and the log line names the one that is missing.

1. **The device.** Pass the graphics device into the container. Check that it
   exists on the computer first: `ls /dev/dri` lists a `renderD128` entry.
2. **The permission to open it.** The device belongs to a group, usually
   `render`, and KROMA's user must be in it. Find the group's ID:

   ```bash
   getent group render | cut -d: -f3
   ```

   On some systems the group is `video`. On a Synology, it is `videodriver`.

3. **Both in the compose file**, under `kroma:`:

   ```yaml
       devices:
         - /dev/dri:/dev/dri
       group_add:
         - "993"
   ```

   Replace `993` with the group ID from step 2.

Recreate the container with `docker compose up -d` and read the log again.

The image carries Intel's drivers, so nothing else is installed on the
computer. It carries no driver for AMD graphics: in Docker, an AMD chip is not
used.

## Docker with an NVIDIA card

Install the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
on the computer, then give the container the card:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, video]
```

## Choose by hand

To force a method, or to rule hardware out while you look for a problem, set
`KROMA_HWACCEL` to `qsv`, `vaapi`, `nvenc`, `videotoolbox` or `software`. On a
computer with more than one graphics device, `KROMA_RENDER_NODE` selects the
one to use. See the [configuration reference](configuration.md#transcoding).

## When there is no graphics chip

Without hardware, KROMA converts on the processor. That works for 1080p on
most machines, and is slow for 4K. Two things help more than any setting:

- Play on a screen that supports the file. Then KROMA converts nothing.
- Keep the number of conversions at once low with `KROMA_MAX_TRANSCODES`. A
  request past the limit is refused, so the screen says so instead of
  stuttering.
