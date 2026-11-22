//! The fields this importer reads from a Jellyfin answer. Where each comes
//! from is in `docs/reference/jellyfin-api.md`.

use std::collections::BTreeMap;

use serde::de::{DeserializeOwned, Error, IgnoredAny};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

fn or_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct ServerInfo {
    #[serde(deserialize_with = "or_default")]
    pub(crate) id: String,
    #[serde(deserialize_with = "or_default")]
    pub(crate) server_name: String,
    #[serde(deserialize_with = "or_default")]
    pub(crate) version: String,
    #[serde(deserialize_with = "or_default")]
    pub(crate) product_name: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct Authenticated {
    pub(crate) user: User,
    #[serde(deserialize_with = "or_default")]
    pub(crate) access_token: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct User {
    #[serde(deserialize_with = "or_default")]
    pub(crate) id: String,
    #[serde(deserialize_with = "or_default")]
    pub(crate) name: String,
    #[serde(deserialize_with = "or_default")]
    pub(crate) policy: Policy,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct Policy {
    pub(crate) is_administrator: bool,
    pub(crate) is_disabled: bool,
    pub(crate) enable_all_folders: bool,
    #[serde(deserialize_with = "or_default")]
    pub(crate) enabled_folders: Vec<String>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) blocked_media_folders: Vec<IgnoredAny>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) excluded_sub_folders: Vec<IgnoredAny>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) blocked_tags: Vec<IgnoredAny>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) allowed_tags: Vec<IgnoredAny>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) include_tags: Vec<IgnoredAny>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) block_unrated_items: Vec<IgnoredAny>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) access_schedules: Vec<IgnoredAny>,
    pub(crate) max_parental_rating: Option<IgnoredAny>,
    pub(crate) max_parental_sub_rating: Option<IgnoredAny>,
}

#[derive(Debug, Default)]
pub(crate) struct Listing<T>(pub(crate) Vec<T>);

impl<'de, T: DeserializeOwned> Deserialize<'de> for Listing<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let rows = match Value::deserialize(deserializer)? {
            Value::Object(mut page) => page.remove("Items").unwrap_or(Value::Null),
            bare => bare,
        };
        let rows: Option<Vec<T>> = serde_json::from_value(rows).map_err(D::Error::custom)?;
        Ok(Self(rows.unwrap_or_default()))
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct Library {
    #[serde(deserialize_with = "or_default")]
    pub(crate) name: String,
    #[serde(deserialize_with = "or_default")]
    pub(crate) locations: Vec<String>,
    pub(crate) collection_type: Option<String>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) item_id: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct ItemsPage {
    #[serde(deserialize_with = "or_default")]
    pub(crate) items: Vec<Item>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) total_record_count: u64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct Item {
    #[serde(deserialize_with = "or_default")]
    pub(crate) id: String,
    pub(crate) name: Option<String>,
    #[serde(rename = "Type", deserialize_with = "or_default")]
    pub(crate) kind: String,
    pub(crate) path: Option<String>,
    pub(crate) production_year: Option<i64>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) provider_ids: BTreeMap<String, Option<String>>,
    pub(crate) index_number: Option<i64>,
    pub(crate) parent_index_number: Option<i64>,
    pub(crate) series_name: Option<String>,
    pub(crate) series_id: Option<String>,
    pub(crate) run_time_ticks: Option<i64>,
    pub(crate) media_source_count: Option<i64>,
    #[serde(deserialize_with = "or_default")]
    pub(crate) media_sources: Vec<MediaSource>,
    pub(crate) user_data: Option<UserData>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct MediaSource {
    pub(crate) path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct UserData {
    #[serde(deserialize_with = "or_default")]
    pub(crate) playback_position_ticks: i64,
    #[serde(deserialize_with = "or_default")]
    pub(crate) play_count: i64,
    #[serde(deserialize_with = "or_default")]
    pub(crate) is_favorite: bool,
    #[serde(deserialize_with = "or_default")]
    pub(crate) played: bool,
    pub(crate) last_played_date: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub(crate) struct Counts {
    #[serde(deserialize_with = "or_default")]
    pub(crate) movie_count: u64,
    #[serde(deserialize_with = "or_default")]
    pub(crate) episode_count: u64,
    #[serde(deserialize_with = "or_default")]
    pub(crate) box_set_count: u64,
    #[serde(deserialize_with = "or_default")]
    pub(crate) program_count: u64,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_null_where_a_list_or_a_name_is_expected_reads_as_empty() {
        let wire = json!({ "Id": "u1", "Name": null, "Policy": { "EnabledFolders": null, "BlockedTags": null } });

        let user: User = serde_json::from_value(wire).unwrap();

        assert_eq!(user.name, "");
        assert!(user.policy.enabled_folders.is_empty());
        assert!(user.policy.blocked_tags.is_empty());
    }

    #[test]
    fn a_user_with_no_policy_sees_no_library_and_is_no_administrator() {
        let user: User = serde_json::from_value(json!({ "Id": "u1" })).unwrap();

        assert!(!user.policy.enable_all_folders);
        assert!(!user.policy.is_administrator);
    }

    #[test]
    fn a_field_this_importer_does_not_know_is_ignored() {
        let wire =
            json!({ "Items": [{ "Id": "i1", "Type": "Movie", "Trickplay": {} }], "StartIndex": 0 });

        let page: ItemsPage = serde_json::from_value(wire).unwrap();

        assert_eq!(page.items[0].kind, "Movie");
    }
}
