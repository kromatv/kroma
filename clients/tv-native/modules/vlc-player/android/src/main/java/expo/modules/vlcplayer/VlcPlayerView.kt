package expo.modules.vlcplayer

import android.content.Context
import android.view.SurfaceView
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout

// `--no-sub-autodetect-file`: KROMA owns subtitle selection and draws it in React,
// so VLC must never pick up a sidecar. The embedded tracks are disabled separately,
// on the player (`spuTrack = -1`), since this option only covers files on disk.
// `--network-caching`: a remote HLS master needs more than the 1s LAN default or
// the first seek stalls.
// The chrome interpolates between reports, so a coarser interval than the frame
// rate is plenty and costs less. Matches the expo-video plane's own cap.
private const val TIME_EMIT_MS = 250L

private val VLC_ARGS =
  arrayListOf(
    "--no-sub-autodetect-file",
    "--network-caching=1500",
    "--audio-time-stretch",
  )

class VlcPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPlayerTime by EventDispatcher()
  private val onPlayerLoad by EventDispatcher()
  private val onPlayerState by EventDispatcher()
  private val onPlayerError by EventDispatcher()

  private val videoLayout = VLCVideoLayout(context)
  private var libVlc: LibVLC? = null
  private var player: MediaPlayer? = null
  private var attached = false
  private var pendingSeekMs: Long? = null
  private var startMs: Long = 0
  private var loadedUri: String? = null
  private var pendingUri: String? = null
  private var seekTargetMs: Long = 0
  private var lastSeekNonce = -1
  private var wantPaused = false
  private var wantAudioIndex = 0
  private var audioFilter = "off"
  private var rate: Float = 1f
  private var lastTimeEmit = 0L

  init {
    videoLayout.layoutParams =
      ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
    addView(videoLayout)
  }

  private fun ensurePlayer(): MediaPlayer {
    player?.let { return it }
    val vlc = LibVLC(context, VLC_ARGS)
    val mp = MediaPlayer(vlc)
    mp.setEventListener { event ->
      when (event.type) {
        MediaPlayer.Event.TimeChanged -> {
          // Gated here, not in JS: libVLC reports at the demuxer's PCR rate, several
          // times faster than the chrome's budget, and every crossing re-renders the
          // whole player tree. The event already carries the time, so the gate also
          // saves a JNI read per tick. Duration arrives on LengthChanged.
          val now = android.os.SystemClock.uptimeMillis()
          if (now - lastTimeEmit >= TIME_EMIT_MS) {
            lastTimeEmit = now
            onPlayerTime(mapOf("timeMs" to event.timeChanged))
          }
        }
        MediaPlayer.Event.LengthChanged -> onPlayerLoad(mapOf("lengthMs" to event.lengthChanged))
        MediaPlayer.Event.ESAdded -> {
          applyAudioTrack()
          if (mp.spuTrack != -1) mp.spuTrack = -1
        }
        MediaPlayer.Event.Playing -> {
          // The resume point, now that the demux can answer a seek. Applied here
          // rather than from JS so it costs no bridge round trip.
          pendingSeekMs?.let {
            pendingSeekMs = null
            mp.time = it
          }
          applyAudioTrack()
          // KROMA draws subtitles in React over the plane. Left to itself VLC
          // burns the embedded track into the picture, and the viewer gets two.
          mp.spuTrack = -1
          mp.volume = boostVolume()
          mp.rate = rate
          onPlayerState(mapOf("state" to "playing"))
        }
        MediaPlayer.Event.Paused -> onPlayerState(mapOf("state" to "paused"))
        MediaPlayer.Event.Buffering ->
          onPlayerState(mapOf("state" to "buffering", "percent" to event.buffering))
        MediaPlayer.Event.EndReached -> onPlayerState(mapOf("state" to "ended"))
        MediaPlayer.Event.EncounteredError ->
          onPlayerError(mapOf("message" to "VLC could not open or decode this stream"))
      }
    }
    libVlc = vlc
    player = mp
    if (!attached) {
      mp.attachViews(videoLayout, null, false, false)
      attached = true
    }
    return mp
  }

  fun setStartMs(ms: Long) {
    startMs = ms
  }

  // Kept on the view, because a new MediaPlayer starts at 1x: a rate chosen before
  // the stream opened (or before a filter reopened it) has to survive both.
  fun setRate(next: Float) {
    rate = next
    player?.rate = next
  }

  fun setSource(uri: String?) {
    pendingUri = uri
  }

  // Opening is deferred to the end of the prop batch, never done inside a setter:
  // Expo applies props in declaration order, so a filter or an offset that sorts
  // after the URL would otherwise open the stream with the previous value and then
  // reopen it - losing the resume point on the way. Idempotent, because props
  // re-apply on every render and reopening would restart the film under the viewer.
  fun commit() {
    val uri = pendingUri
    if (uri.isNullOrEmpty() || uri == loadedUri) return
    loadedUri = uri
    load(uri, startMs)
  }

  private fun load(uri: String, startMs: Long) {
    try {
      val vlcPlayer = ensurePlayer()
      val vlc = libVlc ?: return
      val media = Media(vlc, android.net.Uri.parse(uri))
      // Enabled but NOT forced: forcing removes the software fallback, and a chip
      // that cannot take the stream then stalls on black. The order is spelled out
      // rather than left to VLC's ranking - software is the fallback, never the
      // default, since a TV SoC cannot sustain it.
      media.setHWDecoderEnabled(true, false)
      media.addOption(":codec=mediacodec_ndk,mediacodec_jni,avcodec")
      for (option in filterOptions()) media.addOption(option)
      // NOT `:start-time`: that is a demux-level skip, and on a container VLC
      // cannot seek by time it reads from byte zero and throws frames away, which
      // over HTTP means pulling the whole file to reach the resume point. The
      // offset is applied as a real seek on the first Playing event instead, which
      // libVLC serves with a Range request.
      vlcPlayer.media = media
      pendingSeekMs = if (startMs > 0) startMs else null
      if (!wantPaused) vlcPlayer.play()
      // Released only AFTER play(): the player retains it, but releasing first is
      // the one link in this chain that was never proven on this libVLC build.
      media.release()
    } catch (t: Throwable) {
      onPlayerError(mapOf("message" to (t.message ?: "VLC could not open this stream")))
    }
  }


  // VLC's compressor takes dB where the server's ffmpeg chain takes a linear
  // threshold, so these are the same two curves converted, not new ones:
  // 0.063 -> -24 dB and 0.04 -> -28 dB, makeup 1.4x -> about +3 dB. `boost` is
  // not a compressor at all - it is gain past 100%, for a track that is simply
  // recorded too quiet.
  private fun filterOptions(): List<String> =
    when (audioFilter) {
      "standard" ->
        listOf(
          ":audio-filter=compressor",
          ":compressor-threshold=-24",
          ":compressor-ratio=4",
          ":compressor-attack=10",
          ":compressor-release=250",
          ":compressor-knee=6",
          ":compressor-makeup-gain=3",
        )
      "night" ->
        listOf(
          ":audio-filter=compressor",
          ":compressor-threshold=-28",
          ":compressor-ratio=8",
          ":compressor-attack=4",
          ":compressor-release=250",
          ":compressor-knee=5",
          // No make-up: night is the quietest mode by design, and every other copy of
          // this curve trims BELOW unity (ffmpeg `volume=0.9`). VLC cannot go under
          // unity here, so zero is as close as the filter reaches.
          ":compressor-makeup-gain=0",
        )
      else -> emptyList()
    }

  // 100 is unity; libVLC amplifies up to 200. Applied on every start too, since a
  // new MediaPlayer comes up at unity.
  private fun boostVolume(): Int = if (audioFilter == "boost") 175 else 100

  // A filter belongs to the media, so changing one reopens the stream where it
  // stands. That costs one byte-range request, not a re-download, and it is the
  // only way libVLC takes a new filter chain.
  fun setAudioFilter(mode: String) {
    if (mode == audioFilter) return
    val wasBoostOnly = audioFilter == "boost" || audioFilter == "off"
    audioFilter = mode
    val mp = player
    if (mp != null && (mode == "boost" || mode == "off") && wasBoostOnly) {
      mp.volume = boostVolume()
      return
    }
    val uri = loadedUri ?: return
    startMs = mp?.time ?: 0
    loadedUri = null
    pendingUri = uri
    commit()
  }

  fun setPaused(paused: Boolean) {
    wantPaused = paused
    val mp = player ?: return
    if (paused) {
      if (mp.isPlaying) mp.pause()
    } else if (!mp.isPlaying) {
      mp.play()
    }
  }

  fun setSeekTarget(ms: Long) {
    seekTargetMs = ms
  }

  // Props re-apply on every render, so the nonce is what separates a new request
  // from the same one arriving again.
  fun applySeek(nonce: Int) {
    if (nonce == lastSeekNonce) return
    lastSeekNonce = nonce
    if (nonce <= 0) return
    seekTo(seekTargetMs)
  }


  // VLC rejects a seek before the media is parsed, so a seek arriving early is
  // held and applied on the first Playing event.
  fun seekTo(ms: Long) {
    val mp = player ?: return
    if (mp.length <= 0) {
      pendingSeekMs = ms
      return
    }
    mp.time = ms
  }


  // KROMA counts audio tracks in file order; VLC keys them by its own id. The index
  // is remembered because VLC has no track list until the media is parsed, and a
  // language chosen while the stream opens would otherwise be dropped.
  fun setAudioTrack(index: Int) {
    if (index < 0) return
    wantAudioIndex = index
    applyAudioTrack()
  }

  private fun applyAudioTrack() {
    val index = wantAudioIndex
    val mp = player ?: return
    val playable = mp.audioTracks?.filter { it.id >= 0 } ?: return
    val track = playable.getOrNull(index) ?: return
    if (mp.audioTrack != track.id) mp.audioTrack = track.id
  }

  fun release() {
    player?.let {
      it.stop()
      if (attached) {
        it.detachViews()
        attached = false
      }
      it.release()
    }
    player = null
    libVlc?.release()
    libVlc = null
    // Cleared with the player: a remounted view is asked for the same URL, and a
    // stale value makes commit() treat it as already open and draw nothing.
    loadedUri = null
  }

  // React Native lays out ITS OWN views and stops there: a child added natively is
  // never measured, so it keeps a zero-sized box, its SurfaceView never produces a
  // surface, and libVLC waits for one before it will open the input. Audio comes up
  // (it needs no window), the picture never does, and nothing errors.
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val w = right - left
    val h = bottom - top
    videoLayout.measure(
      MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY),
    )
    videoLayout.layout(0, 0, w, h)
  }

  override fun onDetachedFromWindow() {
    release()
    super.onDetachedFromWindow()
  }
}
