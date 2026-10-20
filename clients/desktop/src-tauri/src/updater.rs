//! The self-update, against the feed of the channel the signed-in server
//! follows. Verified against the pubkey pinned in tauri.conf.json.

use tauri_plugin_updater::UpdaterExt;

const STABLE: &str =
    "https://github.com/kromatv/kroma/releases/download/desktop-stable/latest.json";
const CANARY: &str =
    "https://github.com/kromatv/kroma/releases/download/desktop-latest/latest.json";

fn endpoint(channel: &str) -> &'static str {
    if channel.eq_ignore_ascii_case("canary") {
        CANARY
    } else {
        STABLE
    }
}

/// Install the newest build of `channel` if it is newer than this one, and
/// answer its version; the caller relaunches. `None` when there is nothing newer.
#[tauri::command]
pub async fn update_install(
    app: tauri::AppHandle,
    channel: String,
) -> Result<Option<String>, String> {
    let url = tauri::Url::parse(endpoint(&channel)).map_err(|e| e.to_string())?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    Ok(Some(update.version))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_canary_server_points_the_app_at_the_rolling_build() {
        assert_eq!(endpoint("Canary"), CANARY);
    }

    #[test]
    fn anything_else_is_the_stable_feed() {
        assert_eq!(endpoint("Stable"), STABLE);
        assert_eq!(endpoint(""), STABLE);
    }
}
