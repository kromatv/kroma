package expo.modules.vlcplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VlcPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VlcPlayer")

    View(VlcPlayerView::class) {
      Events("onPlayerTime", "onPlayerLoad", "onPlayerState", "onPlayerError")

      // Flat primitives rather than a Record: a Record crosses the bridge through
      // reflection here (the build warns that its introspection data is missing),
      // and a source that fails to convert applies no prop and reports nothing.
      // Declared before `sourceUri` because props apply in order and the offset
      // has to be known by the time the stream is opened.
      Prop("startMs") { view: VlcPlayerView, ms: Double -> view.setStartMs(ms.toLong()) }

      Prop("sourceUri") { view: VlcPlayerView, uri: String? -> view.setSource(uri) }

      Prop("paused") { view: VlcPlayerView, paused: Boolean -> view.setPaused(paused) }

      // A seek is a nonce, not a value: the same target asked for twice is two
      // seeks, and a prop that only carried the time would replay the last one on
      // every unrelated re-render.
      Prop("seekMs") { view: VlcPlayerView, ms: Double -> view.setSeekTarget(ms.toLong()) }

      Prop("seekNonce") { view: VlcPlayerView, nonce: Int -> view.applySeek(nonce) }

      Prop("audioTrack") { view: VlcPlayerView, index: Int -> view.setAudioTrack(index) }

      Prop("audioFilter") { view: VlcPlayerView, mode: String -> view.setAudioFilter(mode) }

      Prop("rate") { view: VlcPlayerView, rate: Double -> view.setRate(rate.toFloat()) }

      // Every prop above only records state; the stream opens here, once the whole
      // batch has landed, so no prop's declaration order can change what it opens with.
      OnViewDidUpdateProps { view: VlcPlayerView -> view.commit() }
    }
  }
}
