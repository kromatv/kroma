// Publishes KROMA "preview channels" - the named rows on the Android TV / Google
// TV launcher home (distinct from the system "Continue watching" Watch Next row;
// see WatchNext.kt). One channel per home section ("Recently added", "For you",
// ...), so the launcher shows several KROMA rows like the Tizen shortcuts.
//
// Channels are keyed by ROW INDEX (kroma:row:0..N), NOT by the server's section id
// (those aren't stable across launches - themed rows are regenerated - which would
// mint a brand-new channel every time and pile up dozens of duplicates). A fixed
// per-slot key lets each sync reuse the same channel: update its name + programs in
// place, and delete any slot no longer used. Enumeration is a direct provider query
// (PreviewChannelHelper.getAllChannels proved unreliable - it can miss our own rows,
// which is what let the duplicates accumulate).
//
// Each program deep-links back via `kroma://item/<id>`. Publishing a channel does not
// put it on the home: browsable is read-only for an app, so each row has to be offered
// once through requestChannelBrowsable and accepted by the user. A big featured hero is
// NOT available to third-party apps.
package expo.modules.tvlauncher

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.tvprovider.media.tv.PreviewChannel
import androidx.tvprovider.media.tv.PreviewChannelHelper
import androidx.tvprovider.media.tv.PreviewProgram
import androidx.tvprovider.media.tv.TvContractCompat
import org.json.JSONArray
import org.json.JSONObject

object HomeChannel {
    private const val TAG = "KromaHomeChannel"
    private const val KEY_PREFIX = "kroma:row:"
    private const val REQUEST_SHOW_CHANNEL = 4931

    private var askedThisRun = false

    /** Sync a list of launcher rows: `[{title, items:[{id,title,subtitle?,
     * imageUrl?,kind}]}]`, in display order. One preview channel per entry, keyed by
     * ROW INDEX so it reuses the same channel across syncs. `[]` clears every KROMA
     * channel. */
    @Synchronized
    fun sync(context: Context, activity: Activity?, json: String) {
        val specs = try {
            JSONArray(json)
        } catch (e: Exception) {
            Log.w(TAG, "bad home-channel payload", e)
            return
        }
        try {
            val helper = PreviewChannelHelper(context)
            val existing = ourChannels(context) // channelId -> key
            val byKey = HashMap<String, Long>()
            existing.forEach { (id, key) -> if (key.isNotEmpty()) byKey[key] = id }

            val wantedKeys = HashSet<String>()
            val dismissals = LauncherStore.dismissals(context)
            var onHome = 0
            for (i in 0 until specs.length()) {
                val spec = specs.optJSONObject(i) ?: continue
                val key = KEY_PREFIX + i
                wantedKeys.add(key)
                val title = spec.optString("title", "KROMA")
                val items = spec.optJSONArray("items") ?: JSONArray()
                val channelId = byKey[key] ?: publishChannel(context, helper, key, title)
                renameChannel(context, channelId, title)
                reconcilePrograms(context, channelId, items, dismissals)
                // The row is on the home or it is not, and the column says which. Offer
                // the first one that is not, once per app run: a channel the user
                // accepted never asks again, and a decline is not re-asked until the
                // next launch.
                if (isBrowsable(context, channelId)) {
                    onHome++
                } else if (!askedThisRun) {
                    askedThisRun = true
                    askToShow(context, activity, channelId, key)
                }
            }

            // Delete stale rows (a slot we no longer publish) and the legacy pile-up
            // (the old single empty-key "KROMA" channel / retired row slots). Scope to
            // OUR keys (kroma:row:* or the legacy empty key) so a channel some other
            // code might publish for this package is never collateral damage.
            var removed = 0
            existing.forEach { (id, key) ->
                if (key !in wantedKeys && (key.startsWith(KEY_PREFIX) || key.isEmpty())) {
                    deleteChannel(context, id)
                    removed++
                }
            }
            Log.i(TAG, "home-channel synced ${wantedKeys.size} row(s), $onHome on the home, removed $removed stale")
        } catch (e: Exception) {
            Log.w(TAG, "home-channel sync failed", e)
        }
    }

    /** Remove every KROMA preview channel (called on sign-out). */
    @Synchronized
    fun clear(context: Context) {
        runCatching { ourChannels(context).keys.forEach { deleteChannel(context, it) } }
    }

    // Our published channels (channelId -> internalProviderId key), read straight
    // from the provider (package-scoped, so every row is ours).
    private fun ourChannels(context: Context): Map<Long, String> {
        val out = HashMap<Long, String>()
        val projection = arrayOf(
            TvContractCompat.Channels._ID,
            TvContractCompat.Channels.COLUMN_INTERNAL_PROVIDER_ID,
        )
        context.contentResolver.query(
            TvContractCompat.Channels.CONTENT_URI,
            projection,
            null,
            null,
            null,
        )?.use { c ->
            while (c.moveToNext()) out[c.getLong(0)] = c.getString(1) ?: ""
        }
        return out
    }

    // Publish a new named channel keyed by `key`. Publishing alone never puts a row
    // on the home: the ask is a separate step, above.
    private fun publishChannel(
        context: Context,
        helper: PreviewChannelHelper,
        key: String,
        title: String,
    ): Long {
        val channel = PreviewChannel.Builder()
            .setDisplayName(title)
            .setInternalProviderId(key)
            .setAppLinkIntentUri(Uri.parse("kroma://home"))
            .apply { bannerBitmap(context)?.let { setLogo(it) } }
            .build()
        return helper.publishChannel(channel)
    }

    // Two ways to ask, because the platform one is not enough on Google TV: its
    // launcher takes the system's CHANNEL_BROWSABLE_REQUESTED broadcast and draws
    // nothing. The same launcher exposes the add-channel screen as an ACTIVITY, so
    // the owning app can open it itself; the broadcast stays as the fallback for
    // launchers that only implement that half.
    private fun askToShow(context: Context, activity: Activity?, channelId: Long, key: String) {
        val intent = Intent(TvContractCompat.ACTION_REQUEST_CHANNEL_BROWSABLE)
            .putExtra(TvContractCompat.EXTRA_CHANNEL_ID, channelId)
        val handled = context.packageManager.resolveActivity(intent, 0) != null
        val opener = activity?.takeIf { handled }
        Log.i(TAG, "asking to show $key: launcher=$handled opened=${opener != null}")
        if (opener != null) {
            Handler(Looper.getMainLooper()).post {
                runCatching { opener.startActivityForResult(intent, REQUEST_SHOW_CHANNEL) }
            }
        } else {
            runCatching { TvContractCompat.requestChannelBrowsable(context, channelId) }
        }
    }

    // Only the display name: COLUMN_BROWSABLE is read-only for us (the platform gives
    // it to system apps alone), so whether a row is on the home is the user's answer
    // to the prompt, never a column we can write.
    private fun renameChannel(context: Context, channelId: Long, title: String) {
        runCatching {
            val values = ContentValues().apply {
                put(TvContractCompat.Channels.COLUMN_DISPLAY_NAME, title)
            }
            context.contentResolver.update(TvContractCompat.buildChannelUri(channelId), values, null, null)
        }
    }

    private fun isBrowsable(context: Context, channelId: Long): Boolean {
        val projection = arrayOf(TvContractCompat.Channels.COLUMN_BROWSABLE)
        return context.contentResolver.query(
            TvContractCompat.buildChannelUri(channelId),
            projection,
            null,
            null,
            null,
        )?.use { c -> c.moveToFirst() && c.getInt(0) == 1 } ?: false
    }

    private fun deleteChannel(context: Context, channelId: Long) {
        // Deleting a channel cascades to its programs.
        runCatching { context.contentResolver.delete(TvContractCompat.buildChannelUri(channelId), null, null) }
    }

    /** How a card removed from the home is remembered: per ROW, so dropping a film
     * from "Continue watching" leaves it in "Recently added". A Watch Next card has
     * no channel and is keyed by its item id alone. */
    fun dismissKey(channelId: Long, itemId: String): String = "$channelId:$itemId"

    // Insert/refresh this channel's programs and drop the ones no longer listed.
    private fun reconcilePrograms(
        context: Context,
        channelId: Long,
        items: JSONArray,
        dismissals: JSONObject,
    ) {
        val wanted = LinkedHashMap<String, JSONObject>()
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val id = o.optString("id")
            if (id.isNotEmpty()) wanted[id] = o
        }
        val existing = existingPrograms(context, channelId) // itemId -> [programId]
        for ((itemId, o) in wanted) {
            for (rowId in existing[itemId].orEmpty()) removeRow(context, rowId)
            if (LauncherStore.isDismissed(dismissals, dismissKey(channelId, itemId), 0)) continue
            insertRow(context, channelId, itemId, o)
        }
        for ((itemId, rows) in existing) {
            if (!wanted.containsKey(itemId)) for (rowId in rows) removeRow(context, rowId)
        }
    }

    private fun insertRow(context: Context, channelId: Long, itemId: String, o: JSONObject) {
        val type =
            if (o.optString("kind") == "episode") TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE
            else TvContractCompat.PreviewPrograms.TYPE_MOVIE
        val builder = PreviewProgram.Builder()
            .setChannelId(channelId)
            .setType(type)
            .setTitle(o.optString("title"))
            .setInternalProviderId(itemId)
            .setIntentUri(Uri.parse("kroma://item/$itemId"))
        o.optString("subtitle").takeIf { it.isNotEmpty() }?.let { builder.setDescription(it) }
        o.optString("imageUrl").takeIf { it.isNotEmpty() }?.let {
            builder.setPosterArtUri(Uri.parse(it))
            builder.setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9)
        }
        context.contentResolver.insert(
            TvContractCompat.PreviewPrograms.CONTENT_URI,
            builder.build().toContentValues(),
        )
    }

    private fun removeRow(context: Context, rowId: Long) {
        context.contentResolver.delete(TvContractCompat.buildPreviewProgramUri(rowId), null, null)
    }

    // One channel's published programs, grouped by item id (internalProviderId).
    private fun existingPrograms(context: Context, channelId: Long): Map<String, List<Long>> {
        val out = HashMap<String, MutableList<Long>>()
        val projection = arrayOf(
            TvContractCompat.PreviewPrograms._ID,
            TvContractCompat.PreviewPrograms.COLUMN_INTERNAL_PROVIDER_ID,
        )
        context.contentResolver.query(
            TvContractCompat.buildPreviewProgramsUriForChannel(channelId),
            projection,
            null,
            null,
            null,
        )?.use { c ->
            while (c.moveToNext()) {
                val rowId = c.getLong(0)
                val itemId = c.getString(1) ?: continue
                out.getOrPut(itemId) { mutableListOf() }.add(rowId)
            }
        }
        return out
    }

    // The app's TV banner as a bitmap, for the channel logo.
    //
    // Resolved from the APPLICATION INFO rather than a compiled-in `R.drawable`:
    // this is a library module, so the app's resources are not on its R class, and
    // the banner is generated by the TV config plugin (app.json `androidTVBanner`)
    // under a name this module has no business knowing. Falls back to the app icon
    // on a build that declares no banner, and to no logo at all if neither
    // resolves - a channel without a logo still works.
    private fun bannerBitmap(context: Context): Bitmap? {
        val info = context.applicationInfo
        val resId = if (info.banner != 0) info.banner else info.icon
        if (resId == 0) return null
        val d = runCatching { ContextCompat.getDrawable(context, resId) }.getOrNull() ?: return null
        val w = d.intrinsicWidth.coerceAtLeast(1)
        val h = d.intrinsicHeight.coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        d.setBounds(0, 0, w, h)
        d.draw(Canvas(bmp))
        return bmp
    }
}
