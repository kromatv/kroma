# @kroma/media3-ffmpeg

Media3's FFmpeg **audio** decoders, prebuilt for Android and shipped with the app.

## Why this exists

When a client cannot decode a track, the server re-encodes it: audio to stereo AAC,
and video to H.264 where the client declares it cannot take the picture. Every such
re-encode is server CPU. A decoder on the television removes that branch - the file
direct-plays and the server stays at stream-copy.

The gap on Android is DTS, TrueHD, and E-AC3 on sets without the licence. Video is
not the problem: H.264, HEVC, VP9 and AV1 are hardware on any modern Android TV SoC,
and software-decoding video is not something a Chromecast-class device can do anyway.

This package is one of two halves. The other is `patches/expo-video@57.0.2.patch`,
which sets `EXTENSION_RENDERER_MODE_ON` - `DefaultRenderersFactory` finds these
decoders by reflection, but only when the mode is not `OFF`, and `OFF` is the
default. Ship one without the other and nothing changes.

`ON` rather than `PREFER` is deliberate: it places the extension renderers *after*
the `MediaCodec` ones, so hardware still decodes everything it can and FFmpeg only
picks up what is left.

## The patch has two halves

`patches/expo-video@57.0.2.patch` touches two files, and it is easy to see only one
of them. The renderer mode in `VideoPlayer.kt` is the visible half. The other deletes
`android.publication` from expo-video's `expo-module.config.json`, and without it the
first half does nothing at all.

Expo SDK 57 ships prebuilt Android binaries for its own modules. expo-video carries

```
local-maven-repo/host/exp/exponent/expo.modules.video/57.0.2/expo.modules.video-57.0.2.aar
```

and expo-autolinking prefers that publication over compiling `android/src`. The Gradle
plugin decides with `usePublication = publication != null && shouldUsePublication`
(`ExpoAutolinkingPlugin.kt` / `ExpoAutolinkingConfig.kt`), and the "Using expo modules"
block of the build log marks every module resolved that way with a package emoji.

So patching the Kotlin alone is a silent no-op: the build finishes in about four
seconds, `:expo-video:compileDebugKotlin` never runs, the prebuilt `.aar` is linked,
and the patched source is ignored. Nothing errors. Removing `android.publication` makes
`usePublication` false, which forces compilation from source and lets the renderer-mode
patch take effect.

The cost is real and permanent: expo-video is compiled from source on every clean
Android build, so those builds are slower. That is the price of the patch, not a
regression to chase.

**On every expo-video upgrade, both halves must be re-applied and re-verified.** The
version bump renames the patch file and moves the publication version, so the
renderer-mode hunk can apply cleanly while the config hunk does not - which looks like
a working build that has quietly gone back to the prebuilt AAR.

### Check the copy the client actually builds

bun keeps a separate copy of a dependency per workspace: `node_modules/expo-video` and
`clients/tv-native/node_modules/expo-video` are different directories, and only the one
the client resolves is the one Gradle compiles. Inspecting the root copy proves nothing.
Grep the client's:

```bash
grep -n EXTENSION_RENDERER_MODE \
  clients/tv-native/node_modules/expo-video/android/src/main/java/expo/modules/video/player/VideoPlayer.kt
grep -n publication clients/tv-native/node_modules/expo-video/expo-module.config.json
```

The first must print the `setExtensionRendererMode` line; the second must print nothing.

## Rebuilding the .aar

Media3 publishes this module as source only - there is no Maven artifact carrying the
native code, because which decoders to compile in is a build-time choice. Rebuild
when the media3 runtime version moves (keep the two in step; the version is in the
filename), or when a decoder needs adding.

Requires the Android NDK (built with 27.1.12297006).

```bash
git clone --depth 1 -b 1.9.0 https://github.com/androidx/media.git media3
MODULE="$PWD/media3/libraries/decoder_ffmpeg/src/main"
git clone --depth 1 -b release/6.0 https://git.ffmpeg.org/ffmpeg.git "$MODULE/jni/ffmpeg"

cd "$MODULE/jni"
./build_ffmpeg.sh "$MODULE" "$ANDROID_NDK" darwin-x86_64 21 \
  vorbis opus flac alac pcm_mulaw pcm_alaw mp3 aac ac3 eac3 dca mlp truehd

cd "$PWD/media3" && ./gradlew :lib-decoder-ffmpeg:assembleRelease
cp libraries/decoder_ffmpeg/buildout/outputs/aar/lib-decoder-ffmpeg-release.aar \
   packages/media3-ffmpeg/android/media3-decoder-ffmpeg-<version>.aar
```

`dca` is DTS and `mlp` is what TrueHD decodes through. The static libraries the first
command leaves behind are ~46 MB; the linker cuts them to ~1.5 MB per ABI, which is
what the 3.2 MB `.aar` actually carries.

All of the decoders above are FFmpeg's own, so the build stays LGPL - no
`--enable-gpl`, nothing that would put a stricter licence on the artifact than the
GPL-2.0-or-later this repository already carries.

## Verifying it on a device

`DefaultRenderersFactory` logs when the reflection lookup succeeds:

```bash
adb logcat -d | grep -E "Loaded FfmpegAudioRenderer|media3.decoder.ffmpeg"
```

`DefaultRenderersFactory: Loaded FfmpegAudioRenderer.` is the only proof that the
decoders are wired in rather than merely shipped (confirmed on a Google TV emulator).
Nothing in the picture changes when it works, and an undecodable track plays as silence
instead of failing, so there is no symptom to read in its place.

The second signal is ExoPlayer's `Init`/`Release` line, which lists the modules linked
into the player: `media3.decoder.ffmpeg` appears there once the `.aar` is in the APK.
That only says the decoders shipped - the first line is the one that settles whether
they were loaded.
