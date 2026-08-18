import ExpoModulesCore

public class VlcPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VlcPlayer")

    View(VlcPlayerView.self) {
      Events("onPlayerTime", "onPlayerLoad", "onPlayerState", "onPlayerError")

      // Declared before `sourceUri` because props apply in order and the offset
      // has to be known by the time the stream is opened.
      Prop("startMs") { (view: VlcPlayerView, ms: Double) in
        view.setStartMs(Int64(ms))
      }

      Prop("sourceUri") { (view: VlcPlayerView, uri: String?) in
        view.setSource(uri)
      }

      Prop("paused") { (view: VlcPlayerView, paused: Bool) in
        view.setPaused(paused)
      }

      // A seek is a nonce, not a value: the same target asked for twice is two
      // seeks, and a prop carrying only the time would replay the last one on
      // every unrelated re-render.
      Prop("seekMs") { (view: VlcPlayerView, ms: Double) in
        view.setSeekTarget(Int64(ms))
      }

      Prop("seekNonce") { (view: VlcPlayerView, nonce: Int) in
        view.applySeek(nonce)
      }

      Prop("audioTrack") { (view: VlcPlayerView, index: Int) in
        view.setAudioTrack(index)
      }

      Prop("audioFilter") { (view: VlcPlayerView, mode: String) in
        view.setAudioFilter(mode)
      }

      Prop("rate") { (view: VlcPlayerView, rate: Double) in
        view.setRate(Float(rate))
      }

      // Every prop above only records state; the stream opens here, once the whole
      // batch has landed, so no prop's declaration order can change what it opens with.
      OnViewDidUpdateProps { (view: VlcPlayerView) in
        view.commit()
      }
    }
  }
}
