//! Row mappers for the shared `users` / `files` / `items` shapes.

use rusqlite::Row;

use kroma_domain::{
    AudioStream, Kind, MediaFile, MediaItem, Metadata, Permission, SubtitleTrack, User, VideoStream,
};

/// Parse a stored `metadata` JSON blob into [`Metadata`]; tolerant of nulls and
/// stale shapes (returns `None`).
pub(crate) fn parse_metadata(json: Option<String>) -> Option<Metadata> {
    json.and_then(|j| serde_json::from_str::<Metadata>(&j).ok())
}

/// Map a row of
/// `id,email,username,avatar_url,created_at,permissions,language,has_pin,audio_language,subtitle_language`
/// to a [`User`]. Column 7 is a boolean (`pin_hash IS NOT NULL`) every SELECT
/// that feeds this must project cols 0..=9 (the password-hash lookups carry them
/// before their trailing `password_hash`). Column 6 is read as `language`; the
/// admin members query repurposes it for `last_seen` (which the caller re-reads
/// itself).
pub(crate) fn row_to_user(r: &Row) -> rusqlite::Result<User> {
    Ok(User {
        id: r.get(0)?,
        email: r.get(1)?,
        username: r.get(2)?,
        avatar_url: r.get(3)?,
        created_at: r.get(4)?,
        permissions: parse_permissions(&r.get::<_, String>(5)?),
        language: r.get(6)?,
        has_pin: r.get(7)?,
        audio_language: r.get(8)?,
        subtitle_language: r.get(9)?,
    })
}

/// Parse a stored `permissions` JSON array of string keys, dropping any unknown
/// keys (tolerant forward-compat). Falls back to `[Playback]` on malformed JSON.
pub(crate) fn parse_permissions(json: &str) -> Vec<Permission> {
    match serde_json::from_str::<Vec<String>>(json) {
        Ok(keys) => keys.iter().filter_map(|k| Permission::parse(k)).collect(),
        Err(_) => vec![Permission::Playback],
    }
}

// Build a [`MediaFile`] from a row selected with [`FILE_COLS`].
pub(crate) fn row_to_file(r: &Row) -> rusqlite::Result<MediaFile> {
    let probed: i64 = r.get(5)?;
    let v_codec: Option<String> = r.get(7)?;
    let video = v_codec.map(|codec| VideoStream {
        codec,
        width: r.get(8).ok().flatten(),
        height: r.get(9).ok().flatten(),
        hdr: r.get::<_, Option<i64>>(10).ok().flatten().unwrap_or(0) != 0,
        bit_depth: r.get(11).ok().flatten(),
    });
    let subs_json: String = r.get(15)?;
    let subtitles: Vec<SubtitleTrack> = serde_json::from_str(&subs_json).unwrap_or_default();
    let tracks_json: String = r.get(17)?;
    let audio_tracks: Vec<AudioStream> = serde_json::from_str(&tracks_json).unwrap_or_default();
    // Representative audio = first listed track. Fall back to the legacy
    // a_codec/a_channels/a_language columns for rows probed before audio_tracks
    // existed (their JSON is still `[]`).
    let audio = audio_tracks.first().cloned().or_else(|| {
        r.get::<_, Option<String>>(12).ok().flatten().map(|codec| AudioStream {
            index: 0,
            codec,
            channels: r.get(13).ok().flatten(),
            language: r.get(14).ok().flatten(),
            title: None,
            default: true,
        })
    });

    Ok(MediaFile {
        id: r.get(0)?,
        rel_path: r.get(1)?,
        container: r.get(2)?,
        size: r.get::<_, Option<i64>>(3)?.map(|s| s as u64),
        edition: r.get(4)?,
        probed: probed != 0,
        duration_ms: r.get::<_, Option<i64>>(6)?.map(|d| d as u64),
        video,
        audio,
        audio_tracks,
        subtitles,
        abs_path: r.get(16)?,
    })
}

/// Build a [`MediaItem`] base from a row selected with [`ITEM_COLS`]. The
/// representative stream fields and `files[]` are filled in afterwards by
/// [`attach_files`]; the legacy `items.v_*`/`a_*` columns are ignored (stream
/// data now lives on `files`).
pub(crate) fn row_to_item(r: &Row) -> rusqlite::Result<MediaItem> {
    let subs_json: String = r.get(14)?;
    let subtitles: Vec<SubtitleTrack> = serde_json::from_str(&subs_json).unwrap_or_default();

    let metadata = parse_metadata(r.get(25)?);

    Ok(MediaItem {
        id: r.get(0)?,
        kind: parse_kind(&r.get::<_, String>(1)?),
        title: r.get(2)?,
        year: r.get(3)?,
        duration_ms: r.get::<_, Option<i64>>(4)?.map(|d| d as u64),
        container: r.get(5)?,
        video: None,
        audio: None,
        audio_tracks: Vec::new(),
        subtitles,
        library: r.get(15)?,
        show_id: r.get(16)?,
        show_title: r.get(17)?,
        season: r.get(18)?,
        episode: r.get(19)?,
        episode_end: r.get(20)?,
        episode_title: r.get(21)?,
        rel_path: r.get(22)?,
        abs_path: r.get(23)?,
        added_at: r.get(24)?,
        metadata,
        files: Vec::new(),
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    })
}

pub(crate) fn parse_kind(s: &str) -> Kind {
    match s {
        "episode" => Kind::Episode,
        "video" => Kind::Video,
        _ => Kind::Movie,
    }
}

#[cfg(test)]
mod row_tests {
    use super::*;
    use crate::FILE_COLS;

    #[test]
    fn permissions_that_are_not_a_json_array_fall_back_to_playback_alone() {
        assert_eq!(parse_permissions(r#"["playback","users.manage"]"#), vec![
            Permission::Playback,
            Permission::UsersManage
        ]);
        assert_eq!(parse_permissions(r#"["playback","modules.manage"]"#), vec![Permission::Playback]);
        assert_eq!(parse_permissions("not json"), vec![Permission::Playback]);
        assert_eq!(parse_permissions(""), vec![Permission::Playback]);
    }

    #[test]
    fn a_file_probed_before_audio_tracks_existed_still_reports_its_audio() {
        let pool = crate::testing::temp_pool("row-file");
        let conn = pool.get().unwrap();
        conn.execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movie','/x','t');\
             INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('it','movie','F','mkv','lib','t');\
             INSERT INTO files (id,item_id,abs_path,container,probed,a_codec,a_channels,a_language,audio_tracks) \
             VALUES ('f1','it','/m/a.mkv','mkv',1,'eac3',6,'fr','[]');",
        )
        .unwrap();

        let file = conn
            .query_row(&format!("SELECT {FILE_COLS} FROM files WHERE id='f1'"), [], row_to_file)
            .unwrap();
        let audio = file.audio.expect("the legacy columns stand in for an empty audio_tracks");
        assert_eq!(audio.codec, "eac3");
        assert_eq!(audio.channels, Some(6));
        assert_eq!(audio.language.as_deref(), Some("fr"));
        assert_eq!(audio.index, 0);
        assert!(audio.default);
        assert!(audio.title.is_none());
        assert!(file.audio_tracks.is_empty());
    }
}
