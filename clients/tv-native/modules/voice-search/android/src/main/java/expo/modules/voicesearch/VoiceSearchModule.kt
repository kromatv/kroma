package expo.modules.voicesearch

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Android TV half of KROMA's voice search: the remote's microphone, through
 * the platform recogniser.
 *
 * Android is the only television platform that lends an app the microphone at
 * all (tvOS keeps the Siri Remote's mic to itself and offers system dictation
 * instead), so this module exists only here and the app treats it as an optional
 * capability: no module, no mic button.
 *
 * Partial results are the point. `EXTRA_PARTIAL_RESULTS` makes the recogniser
 * report words as they are understood rather than only at the end, which is what
 * lets the results grid fill in while the user is still speaking.
 *
 * Everything touching [SpeechRecognizer] runs on the main thread: the class
 * demands it and throws otherwise.
 */
class VoiceSearchModule : Module() {
  private var recognizer: SpeechRecognizer? = null

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VoiceSearch")

    // `partial` fires many times per session; `result` and `error` end it.
    Events("partial", "result", "error")

    /** False when the device has no recognition service (some Android TV boxes
     * ship without one). The app hides the mic entirely then. */
    Function("isAvailable") {
      SpeechRecognizer.isRecognitionAvailable(context)
    }

    AsyncFunction("start") { locale: String, promise: Promise ->
      release()
      if (!SpeechRecognizer.isRecognitionAvailable(context)) {
        promise.reject("E_UNAVAILABLE", "No speech recognition service on this device", null)
        return@AsyncFunction
      }
      val speech = SpeechRecognizer.createSpeechRecognizer(context)
      speech.setRecognitionListener(listener())
      recognizer = speech
      speech.startListening(intent(locale))
      promise.resolve(null)
    }.runOnQueue(Queues.MAIN)

    /** Stop listening and take whatever was heard: the recogniser still delivers
     * a final `result` after this. Cancelling instead would throw the sentence
     * away, which is not what a user pressing "done" means. */
    AsyncFunction("stop") {
      recognizer?.stopListening()
    }.runOnQueue(Queues.MAIN)

    /** Abandon the session with no result (the user left the panel). */
    AsyncFunction("cancel") {
      release()
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      release()
    }
  }

  private fun intent(locale: String) =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      // Some recognisers refuse to start without knowing who is asking.
      putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
    }

  private fun listener() = object : RecognitionListener {
    override fun onPartialResults(results: Bundle) {
      best(results)?.let { sendEvent("partial", mapOf("text" to it)) }
    }

    override fun onResults(results: Bundle) {
      sendEvent("result", mapOf("text" to (best(results) ?: "")))
      release()
    }

    override fun onError(error: Int) {
      sendEvent("error", mapOf("code" to error))
      release()
    }

    override fun onReadyForSpeech(params: Bundle?) = Unit
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = Unit
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }

  /** The best transcription in a results bundle, or null when it carries none. */
  private fun best(results: Bundle): String? =
    results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

  /** Free the recogniser: it holds the microphone until destroyed, so every exit
   * from a session goes through here, including one that ends by itself. */
  private fun release() {
    recognizer?.let {
      it.setRecognitionListener(null)
      it.cancel()
      it.destroy()
    }
    recognizer = null
  }
}
