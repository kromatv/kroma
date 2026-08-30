package expo.modules.tvlauncher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.tvprovider.media.tv.TvContractCompat

class LauncherReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val app = context.applicationContext
        val pending = goAsync()
        Thread {
            try {
                when (action) {
                    TvContractCompat.ACTION_INITIALIZE_PROGRAMS -> republish(app)
                    TvContractCompat.ACTION_PREVIEW_PROGRAM_BROWSABLE_DISABLED ->
                        forgetPreview(app, intent.getLongExtra(TvContractCompat.EXTRA_PREVIEW_PROGRAM_ID, 0))

                    TvContractCompat.ACTION_WATCH_NEXT_PROGRAM_BROWSABLE_DISABLED ->
                        forgetWatchNext(app, intent.getLongExtra(TvContractCompat.EXTRA_WATCH_NEXT_PROGRAM_ID, 0))
                }
            } catch (e: Exception) {
                Log.w(TAG, "$action failed", e)
            } finally {
                pending.finish()
            }
        }.start()
    }

    // The launcher asks for our rows when the user adds one of our channels, which
    // can happen with the app closed - so the answer comes from the last payload the
    // app pushed, not from the server.
    private fun republish(context: Context) {
        val home = LauncherStore.home(context)
        val watchNext = LauncherStore.watchNext(context)
        if (home == null && watchNext == null) {
            Log.i(TAG, "initialize-programs: nothing published yet")
            return
        }
        home?.let { HomeChannel.sync(context, null, it) }
        watchNext?.let { WatchNext.sync(context, it) }
    }

    // The action is exported, so any app can name a row id. A query answers only
    // for our OWN programs: a row that does not resolve is not ours to dismiss or
    // to delete, and the broadcast is dropped.
    private fun forgetPreview(context: Context, rowId: Long) {
        if (rowId <= 0) return
        val uri = TvContractCompat.buildPreviewProgramUri(rowId)
        val projection = arrayOf(
            TvContractCompat.PreviewPrograms.COLUMN_INTERNAL_PROVIDER_ID,
            TvContractCompat.PreviewPrograms.COLUMN_CHANNEL_ID,
        )
        val row = context.contentResolver.query(uri, projection, null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.let { it to c.getLong(1) } else null
        } ?: return
        LauncherStore.dismiss(context, HomeChannel.dismissKey(row.second, row.first))
        context.contentResolver.delete(uri, null, null)
    }

    private fun forgetWatchNext(context: Context, rowId: Long) {
        if (rowId <= 0) return
        val uri = TvContractCompat.buildWatchNextProgramUri(rowId)
        val projection = arrayOf(TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID)
        val itemId = context.contentResolver.query(uri, projection, null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        } ?: return
        LauncherStore.dismiss(context, itemId)
        context.contentResolver.delete(uri, null, null)
    }

    private companion object {
        const val TAG = "KromaTvLauncher"
    }
}
