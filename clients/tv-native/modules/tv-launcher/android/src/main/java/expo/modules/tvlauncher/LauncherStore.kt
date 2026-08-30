package expo.modules.tvlauncher

import android.content.Context
import org.json.JSONObject

object LauncherStore {
    private const val PREFS = "kroma.tv-launcher"
    private const val KEY_HOME = "home-channels"
    private const val KEY_WATCH_NEXT = "watch-next"
    private const val KEY_DISMISSED = "dismissed"
    private const val MAX_DISMISSED = 200

    fun rememberHome(context: Context, json: String) = put(context, KEY_HOME, json)

    fun rememberWatchNext(context: Context, json: String) = put(context, KEY_WATCH_NEXT, json)

    fun home(context: Context): String? = get(context, KEY_HOME)

    fun watchNext(context: Context): String? = get(context, KEY_WATCH_NEXT)

    fun dismiss(context: Context, itemId: String) {
        if (itemId.isEmpty()) return
        val dismissed = dismissals(context)
        dismissed.put(itemId, System.currentTimeMillis())
        while (dismissed.length() > MAX_DISMISSED) {
            val oldest = dismissed.keys().asSequence().minByOrNull { dismissed.optLong(it) } ?: break
            dismissed.remove(oldest)
        }
        put(context, KEY_DISMISSED, dismissed.toString())
    }

    /** Every dismissal, keyed by item id: a sync reads it once and tests each of
     * its rows against the result, rather than re-reading the store per row. */
    fun dismissals(context: Context): JSONObject =
        runCatching { JSONObject(get(context, KEY_DISMISSED) ?: "{}") }.getOrElse { JSONObject() }

    // A card the user removed from the home screen stays gone until the item moves
    // on: `updatedAtMs` past the dismissal brings it back (more of a film watched),
    // and 0 means nothing will.
    fun isDismissed(dismissals: JSONObject, itemId: String, updatedAtMs: Long): Boolean {
        val at = dismissals.optLong(itemId, 0)
        return at > 0 && updatedAtMs <= at
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }

    private fun put(context: Context, key: String, value: String) {
        prefs(context).edit().putString(key, value).apply()
    }

    private fun get(context: Context, key: String): String? =
        prefs(context).getString(key, null)?.takeIf { it.isNotEmpty() }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
