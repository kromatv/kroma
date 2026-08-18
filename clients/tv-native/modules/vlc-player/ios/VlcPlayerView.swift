import ExpoModulesCore

#if os(tvOS)
  import TVVLCKit
#else
  import MobileVLCKit
#endif

// The Apple half of the libVLC plane; see the Kotlin next door for Android. The
// reason it exists is sharper here than there: AVFoundation has no Matroska
// demuxer at all, so today every MKV is a server remux. VLC carries its own
// demuxers and decoders, which lets those titles direct-play instead.
final class VlcPlayerView: ExpoView {
  private let onPlayerTime = EventDispatcher()
  private let onPlayerLoad = EventDispatcher()
  private let onPlayerState = EventDispatcher()
  private let onPlayerError = EventDispatcher()

  private let surface = UIView()
  private var player: VLCMediaPlayer?
  private var loadedUri: String?
  private var pendingUri: String?
  private var startMs: Int64 = 0
  private var pendingSeekMs: Int64?
  private var seekTargetMs: Int64 = 0
  private var lastSeekNonce = -1
  private var wantPaused = false
  private var wantAudioIndex = 0
  private var audioFilter = "off"
  private var rate: Float = 1
  private var lastLengthMs: Int64 = 0
  private var lastTimeEmit: TimeInterval = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    addSubview(surface)
  }

  // The plane fills the view; React lays out ITS own views only, so a subview
  // added here is positioned by hand or it stays at zero and never draws.
  override func layoutSubviews() {
    super.layoutSubviews()
    surface.frame = bounds
  }

  private func ensurePlayer() -> VLCMediaPlayer {
    if let existing = player { return existing }
    // `--no-sub-autodetect-file`: KROMA draws subtitles in React, so VLC must not
    // pick up a sidecar. Embedded tracks are disabled separately, on the player.
    let media = VLCMediaPlayer(options: [
      "--no-sub-autodetect-file",
      "--network-caching=1500",
      "--audio-time-stretch",
    ])
    media.drawable = surface
    media.delegate = self
    player = media
    return media
  }

  // VLC's compressor takes dB where the server's ffmpeg chain takes a linear
  // threshold: the same two curves converted, not new ones. `boost` is gain past
  // unity rather than compression, for a track recorded too quietly.
  private func filterOptions() -> [String] {
    switch audioFilter {
    case "standard":
      return [
        ":audio-filter=compressor", ":compressor-threshold=-24", ":compressor-ratio=4",
        ":compressor-attack=10", ":compressor-release=250", ":compressor-knee=6",
        ":compressor-makeup-gain=3",
      ]
    case "night":
      return [
        ":audio-filter=compressor", ":compressor-threshold=-28", ":compressor-ratio=8",
        ":compressor-attack=4", ":compressor-release=250", ":compressor-knee=5",
        // No make-up: night is the quietest mode by design; see the Kotlin twin.
        ":compressor-makeup-gain=0",
      ]
    default:
      return []
    }
  }

  private func boostVolume() -> Int32 { audioFilter == "boost" ? 175 : 100 }

  func setStartMs(_ ms: Int64) { startMs = ms }

  // Kept on the view, because a new player starts at 1x: a rate chosen before the
  // stream opened (or before a filter reopened it) has to survive both.
  func setRate(_ next: Float) {
    rate = next
    player?.rate = next
  }

  func setSource(_ uri: String?) {
    pendingUri = uri
  }

  // Opening is deferred to the end of the prop batch, never done inside a setter:
  // Expo applies props in declaration order, so a filter or an offset that sorts
  // after the URL would otherwise open the stream with the previous value and then
  // reopen it - losing the resume point on the way. Idempotent, because props
  // re-apply on every render and reopening would restart the film under the viewer.
  func commit() {
    guard let uri = pendingUri, !uri.isEmpty, uri != loadedUri, let url = URL(string: uri)
    else { return }
    loadedUri = uri
    // Reset per open: it gates the pending seek, and a reopen of the same media has
    // an identical length, so a stale value swallows the resume point forever.
    lastLengthMs = 0
    let vlc = ensurePlayer()
    let media = VLCMedia(url: url)
    // Spelled out rather than left to VLC's own ranking: VideoToolbox first, and
    // avcodec only as the last resort. Software decoding is what this engine
    // exists for, but it is the fallback, never the default.
    media.addOption(":codec=videotoolbox,avcodec")
    for option in filterOptions() { media.addOption(option) }
    vlc.media = media
    pendingSeekMs = startMs > 0 ? startMs : nil
    if !wantPaused { vlc.play() }
  }

  func setPaused(_ paused: Bool) {
    wantPaused = paused
    guard let vlc = player else { return }
    if paused {
      if vlc.isPlaying { vlc.pause() }
    } else if !vlc.isPlaying {
      vlc.play()
    }
  }

  func setSeekTarget(_ ms: Int64) { seekTargetMs = ms }

  // Props re-apply on every render, so the nonce is what separates a new request
  // from the same one arriving again.
  func applySeek(_ nonce: Int) {
    guard nonce != lastSeekNonce else { return }
    lastSeekNonce = nonce
    guard nonce > 0 else { return }
    seek(to: seekTargetMs)
  }

  private func seek(to ms: Int64) {
    guard let vlc = player else { return }
    guard lastLengthMs > 0 else {
      pendingSeekMs = ms
      return
    }
    vlc.time = VLCTime(number: NSNumber(value: ms))
  }

  // KROMA counts audio tracks in file order; VLC keys them by its own id, so an
  // index cannot be handed over as-is. The wanted index is remembered because
  // VLC has no track list until the media is parsed.
  func setAudioTrack(_ index: Int) {
    guard index >= 0 else { return }
    wantAudioIndex = index
    applyAudioTrack()
  }

  private func applyAudioTrack() {
    guard let vlc = player, let ids = vlc.audioTrackIndexes as? [NSNumber] else { return }
    let playable = ids.filter { $0.intValue >= 0 }
    guard wantAudioIndex < playable.count else { return }
    let wanted = playable[wantAudioIndex].int32Value
    if vlc.currentAudioTrackIndex != wanted { vlc.currentAudioTrackIndex = wanted }
  }

  // A filter belongs to the media, so changing one reopens the stream where it
  // stands: one byte-range request, not a re-download. Boost is only a volume
  // change and is applied in place.
  func setAudioFilter(_ mode: String) {
    guard mode != audioFilter else { return }
    let wasGainOnly = audioFilter == "boost" || audioFilter == "off"
    audioFilter = mode
    if let vlc = player, wasGainOnly, mode == "boost" || mode == "off" {
      vlc.audio?.volume = boostVolume()
      return
    }
    guard let uri = loadedUri else { return }
    startMs = Int64(player?.time.intValue ?? 0)
    loadedUri = nil
    pendingUri = uri
    commit()
  }

  func release() {
    player?.stop()
    player?.delegate = nil
    player = nil
    // Cleared with the player: a remounted view is asked for the same URL, and a
    // stale value makes commit() treat it as already open and draw nothing.
    loadedUri = nil
    lastLengthMs = 0
  }

  override func removeFromSuperview() {
    release()
    super.removeFromSuperview()
  }
}

extension VlcPlayerView: VLCMediaPlayerDelegate {
  func mediaPlayerTimeChanged(_: Notification) {
    guard let vlc = player else { return }
    let lengthMs = Int64(vlc.media?.length.intValue ?? 0)
    if lengthMs > 0, lengthMs != lastLengthMs {
      lastLengthMs = lengthMs
      onPlayerLoad(["lengthMs": lengthMs])
      if let pending = pendingSeekMs {
        pendingSeekMs = nil
        vlc.time = VLCTime(number: NSNumber(value: pending))
      }
    }
    // Gated: VLC reports at the demuxer's rate, several times faster than the
    // chrome's budget, and every crossing re-renders the whole player tree.
    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastTimeEmit >= 0.25 else { return }
    lastTimeEmit = now
    onPlayerTime(["timeMs": Int64(vlc.time.intValue)])
  }

  func mediaPlayerStateChanged(_: Notification) {
    guard let vlc = player else { return }
    switch vlc.state {
    case .playing:
      applyAudioTrack()
      // KROMA draws subtitles in React over the plane; left alone VLC burns the
      // embedded track into the picture and the viewer gets two.
      vlc.currentVideoSubTitleIndex = -1
      vlc.audio?.volume = boostVolume()
      vlc.rate = rate
      onPlayerState(["state": "playing"])
    case .paused:
      onPlayerState(["state": "paused"])
    case .buffering:
      onPlayerState(["state": "buffering", "percent": 100])
    case .ended, .stopped:
      onPlayerState(["state": "ended"])
    case .error:
      onPlayerError(["message": "VLC could not open or decode this stream"])
    default:
      break
    }
  }
}
