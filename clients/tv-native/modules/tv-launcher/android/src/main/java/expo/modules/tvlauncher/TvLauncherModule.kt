package expo.modules.tvlauncher

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Android TV half of KROMA's launcher presence: the rows the app publishes
 * OUT to the television's own home screen.
 *
 * Two surfaces, both content-provider writes and neither reachable from JS:
 * the system "Continue watching" (Watch Next) row, and KROMA's own named
 * preview channels. Android is the only television platform that lends an app
 * the home screen at all - tvOS has Top Shelf, but it is declarative artwork
 * from the app's own extension, not a list an app pushes - so this module
 * exists only here and the app treats it as an optional capability.
 *
 * The traffic is not one-way: the launcher asks for the rows again when the user
 * adds one of our channels, and reports the cards they remove, both with the app
 * closed. [LauncherReceiver] answers from the last payload JS pushed, which is why
 * every push is also written to [LauncherStore].
 *
 * Every call is fire-and-forget on a background thread. A provider write is
 * disk I/O against another process, the caller is a React effect, and nothing
 * in the app waits on the result: a launcher row that fails to publish must
 * cost a log line, never a frame. [WatchNext] and [HomeChannel] are each
 * `@Synchronized`, so overlapping pushes serialise rather than racing each
 * other into duplicate rows.
 */
class TvLauncherModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TvLauncher")

    Function("setContinueWatching") { json: String ->
      val ctx = context
      Thread {
        LauncherStore.rememberWatchNext(ctx, json)
        WatchNext.sync(ctx, json)
      }.start()
    }

    Function("setHomeChannel") { json: String ->
      val ctx = context
      // The launcher's add-channel screen refuses anything but
      // startActivityForResult, so the ask needs the Activity, read here on the
      // JS thread while there certainly is one.
      val activity = appContext.activityProvider?.currentActivity
      Thread {
        LauncherStore.rememberHome(ctx, json)
        HomeChannel.sync(ctx, activity, json)
      }.start()
    }

    Function("clear") {
      val ctx = context
      Thread {
        WatchNext.clear(ctx)
        HomeChannel.clear(ctx)
        LauncherStore.clear(ctx)
      }.start()
    }
  }
}
