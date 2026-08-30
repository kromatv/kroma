// Publishes KROMA's "continue watching" list into the Android TV / Google TV
// system "Continue watching" (Watch Next) row on the launcher home screen - the
// platform equivalent of the Tizen Smart Hub carousel.
//
// The open app pushes its list here (TvLauncherModule.setContinueWatching); the
// entries persist on the home screen after the app closes. Each program
// deep-links back via `kroma://item/<id>` (movies) or `kroma://show/<showId>`
// (episodes), which the app receives through `Linking` (see
// src/lib/launcher-links.ts). Each sync reconciles against the
// rows actually published (queried from the provider), so it is idempotent and
// never leaves duplicates behind.
package expo.modules.tvlauncher

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.WatchNextProgram
import org.json.JSONArray
import org.json.JSONObject

object WatchNext {
    private const val TAG = "KromaWatchNext"

    /**
     * Sync the given `continue watching` list (a JSON array of
     * `{id,title,subtitle?,imageUrl?,progressMs,durationMs,kind}`) into the Watch
     * Next row: insert new items, refresh existing ones, and drop rows that are
     * no longer in the list. Best effort - a provider hiccup is logged, never fatal.
     */
    @Synchronized
    fun sync(context: Context, json: String) {
        val wanted = wantedFrom(json) ?: return
        try {
            // Reconcile against what is ACTUALLY published, not a local record that
            // can go stale on reinstall or race with a concurrent sync (which was
            // duplicating rows). Query our existing rows grouped by item id, then:
            // delete every row for an unwanted id, and every DUPLICATE row for a
            // wanted id (keeping one to refresh).
            val existing = existingRows(context) // itemId -> [row, ...]
            val dismissals = LauncherStore.dismissals(context)
            var published = 0
            var touched = 0
            for ((itemId, o) in wanted) {
                val outcome = reconcile(context, itemId, o, existing[itemId].orEmpty(), dismissals)
                if (outcome != Outcome.DISMISSED) published++
                if (outcome == Outcome.WRITTEN) touched++
            }
            for ((itemId, rows) in existing) {
                if (!wanted.containsKey(itemId)) for (row in rows) removeRow(context, row.id)
            }
            Log.i(TAG, "watch-next synced $published item(s), $touched written")
        } catch (e: Exception) {
            Log.w(TAG, "watch-next sync failed", e)
        }
    }

    private enum class Outcome { DISMISSED, UNCHANGED, WRITTEN }

    private fun wantedFrom(json: String): Map<String, JSONObject>? {
        val arr = try {
            JSONArray(json)
        } catch (e: Exception) {
            Log.w(TAG, "bad continue-watching payload", e)
            return null
        }
        val wanted = LinkedHashMap<String, JSONObject>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id")
            if (id.isNotEmpty()) wanted[id] = o
        }
        return wanted
    }

    // One item's rows brought in line with the payload. Keeps ONE row per item and
    // writes only when this item actually moved: rewriting the whole row on every
    // sync is what the Watch Next guidelines forbid, and a delete + insert is a
    // rewrite. A card the user swiped away stays away until they watch more of it.
    private fun reconcile(
        context: Context,
        itemId: String,
        o: JSONObject,
        rows: List<Row>,
        dismissals: JSONObject,
    ): Outcome {
        if (LauncherStore.isDismissed(dismissals, itemId, o.optLong("updatedAtMs", 0))) {
            for (row in rows) removeRow(context, row.id)
            return Outcome.DISMISSED
        }
        val keep = rows.firstOrNull()
        for (row in rows.drop(1)) removeRow(context, row.id)
        if (keep == null) {
            insertRow(context, itemId, o)
            return Outcome.WRITTEN
        }
        val moved = keep.positionMs != o.optLong("progressMs", 0) ||
            keep.engagedAtMs != o.optLong("updatedAtMs", 0)
        if (!moved) return Outcome.UNCHANGED
        updateRow(context, keep.id, itemId, o)
        return Outcome.WRITTEN
    }

    /** Remove every KROMA Watch Next row (called on sign-out). */
    @Synchronized
    fun clear(context: Context) {
        runCatching {
            for ((_, rows) in existingRows(context)) for (row in rows) removeRow(context, row.id)
        }
    }

    private data class Row(val id: Long, val positionMs: Long, val engagedAtMs: Long)

    // Our currently-published Watch Next rows, grouped by item id (the
    // internalProviderId). A query returns only this app's own programs, so any
    // row we see is ours to reconcile. Duplicates for one id land in the list.
    private fun existingRows(context: Context): Map<String, List<Row>> {
        val out = HashMap<String, MutableList<Row>>()
        val projection = arrayOf(
            TvContractCompat.WatchNextPrograms._ID,
            TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID,
            TvContractCompat.WatchNextPrograms.COLUMN_LAST_PLAYBACK_POSITION_MILLIS,
            TvContractCompat.WatchNextPrograms.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS,
        )
        context.contentResolver.query(
            TvContractCompat.WatchNextPrograms.CONTENT_URI,
            projection,
            null,
            null,
            null,
        )?.use { c ->
            while (c.moveToNext()) {
                val itemId = c.getString(1) ?: continue
                out.getOrPut(itemId) { mutableListOf() }
                    .add(Row(c.getLong(0), c.getLong(2), c.getLong(3)))
            }
        }
        return out
    }

    private fun insertRow(context: Context, itemId: String, o: JSONObject) {
        context.contentResolver.insert(
            TvContractCompat.WatchNextPrograms.CONTENT_URI,
            programValues(itemId, o),
        )
    }

    private fun updateRow(context: Context, rowId: Long, itemId: String, o: JSONObject) {
        context.contentResolver.update(
            TvContractCompat.buildWatchNextProgramUri(rowId),
            programValues(itemId, o),
            null,
            null,
        )
    }

    private fun programValues(itemId: String, o: JSONObject): ContentValues {
        val isEpisode = o.optString("kind") == "episode"
        val type =
            if (isEpisode) TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE
            else TvContractCompat.WatchNextPrograms.TYPE_MOVIE
        val dur = o.optLong("durationMs", 0)
        val pos = o.optLong("progressMs", 0)
        // An untouched episode in the continue list is the NEXT one of a series being
        // watched, which the launcher words and sorts differently from a resume.
        val watchNextType =
            if (pos == 0L && isEpisode) TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_NEXT
            else TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE
        // An episode links to its SHOW: the app's movie catalogue cannot resolve
        // an episode id (see launcher-links.ts), the show detail can resume it.
        val showId = o.optString("showId")
        val target =
            if (isEpisode && showId.isNotEmpty()) "kroma://show/${Uri.encode(showId)}"
            else "kroma://item/${Uri.encode(itemId)}"
        val builder = WatchNextProgram.Builder()
            .setType(type)
            .setWatchNextType(watchNextType)
            .setTitle(o.optString("title"))
            .setInternalProviderId(itemId)
            // Required of every video program in the row, and it has to be the id the
            // app knows the asset by, so the launcher can reconcile the two.
            .setContentId(itemId)
            .setLastEngagementTimeUtcMillis(o.optLong("updatedAtMs", 0))
            .setIntentUri(Uri.parse(target))
        if (isEpisode) {
            // Required attributes of a TV episode; without them the row is malformed
            // and a strict launcher drops it.
            o.optInt("season", 0).takeIf { it > 0 }?.let { builder.setSeasonNumber(it) }
            o.optInt("episode", 0).takeIf { it > 0 }?.let { builder.setEpisodeNumber(it) }
        }
        o.optString("subtitle").takeIf { it.isNotEmpty() }?.let { builder.setDescription(it) }
        o.optString("imageUrl").takeIf { it.isNotEmpty() }?.let {
            builder.setPosterArtUri(Uri.parse(it))
            builder.setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9)
        }
        if (dur > 0) builder.setDurationMillis(dur.toInt())
        if (pos > 0) builder.setLastPlaybackPositionMillis(pos.toInt())
        return builder.build().toContentValues()
    }

    private fun removeRow(context: Context, rowId: Long) {
        val uri = TvContractCompat.buildWatchNextProgramUri(rowId)
        context.contentResolver.delete(uri, null, null)
    }
}
