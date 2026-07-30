//! Category translation between a tracker's own ids and Newznab/Torznab
//! category numbers (the ids the rest of KROMA's acquisition stack speaks).

use crate::definition::Definition;

/// Maps a Cardigann category name to its Newznab id; anything unknown falls
/// into `Other` (8000).
pub fn newznab_id(name: &str) -> u32 {
    match name.trim() {
        "Movies" => 2000,
        "Movies/Foreign" => 2010,
        "Movies/Other" => 2020,
        "Movies/SD" => 2030,
        "Movies/HD" => 2040,
        "Movies/UHD" | "Movies/4K" => 2045,
        "Movies/BluRay" => 2050,
        "Movies/3D" => 2060,
        "Movies/DVD" => 2070,
        "Movies/WEB-DL" => 2080,
        "TV" => 5000,
        "TV/WEB-DL" => 5010,
        "TV/Foreign" => 5020,
        "TV/SD" => 5030,
        "TV/HD" => 5040,
        "TV/UHD" => 5045,
        "TV/Other" => 5050,
        "TV/Sport" => 5060,
        "TV/Anime" => 5070,
        "TV/Documentary" => 5080,
        n => match n.split('/').next().unwrap_or("") {
            "Console" => 1000,
            "Audio" => 3000,
            "PC" => 4000,
            "XXX" => 6000,
            "Books" => 7000,
            "Other" => 8000,
            _ => 8000,
        },
    }
}

/// A wanted parent (`2000` Movies) pulls in every tracker category mapped to a
/// `2xxx` sub-bucket; exact ids match too.
pub fn tracker_ids_for(def: &Definition, wanted: &[u32]) -> Vec<String> {
    let buckets: Vec<u32> = wanted.iter().map(|id| id / 1000).collect();
    let mut out = Vec::new();
    for m in &def.caps.categorymappings {
        let nid = newznab_id(&m.cat);
        if wanted.contains(&nid) || buckets.contains(&(nid / 1000)) {
            out.push(m.id.clone());
        }
    }
    // Several sub-buckets can map to one tracker id, and `dedup` only drops
    // consecutive repeats, so sort first to avoid `cat=1,1`.
    out.sort();
    out.dedup();
    out
}

pub fn newznab_for_tracker_id(def: &Definition, tracker_id: &str) -> Option<u32> {
    def.caps
        .categorymappings
        .iter()
        .find(|m| m.id == tracker_id)
        .map(|m| newznab_id(&m.cat))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_map_to_newznab() {
        assert_eq!(newznab_id("Movies/HD"), 2040);
        assert_eq!(newznab_id("TV/Anime"), 5070);
        assert_eq!(newznab_id("Movies"), 2000);
        assert_eq!(newznab_id("Audio/Lossless"), 3000);
        assert_eq!(newznab_id("Something/Weird"), 8000);
    }

    #[test]
    fn parent_buckets_and_exact_subcategories() {
        assert_eq!(newznab_id("Console/Wii"), 1000);
        assert_eq!(newznab_id("PC/Games"), 4000);
        assert_eq!(newznab_id("XXX/HD"), 6000);
        assert_eq!(newznab_id("Books/EBook"), 7000);
        assert_eq!(newznab_id("Other/Misc"), 8000);
        assert_eq!(newznab_id("Movies/4K"), 2045);
        assert_eq!(newznab_id("Movies/UHD"), 2045);
        assert_eq!(newznab_id("TV/UHD"), 5045);
        assert_eq!(newznab_id("TV"), 5000);
        assert_eq!(newznab_id("  Movies/HD  "), 2040);
    }

    fn def_with_mappings() -> Definition {
        let yaml = r#"
id: t
name: T
caps:
  categorymappings:
    - {id: "100", cat: "Movies/HD"}
    - {id: "101", cat: "Movies/UHD"}
    - {id: "200", cat: "TV/HD"}
    - {id: "300", cat: "Audio"}
search:
  rows:
    selector: "tr"
"#;
        crate::definition::parse(yaml.as_bytes()).unwrap()
    }

    #[test]
    fn tracker_ids_pull_in_whole_parent_bucket() {
        let def = def_with_mappings();
        let ids = tracker_ids_for(&def, &[2000]);
        assert_eq!(ids, vec!["100".to_string(), "101".to_string()]);
        let leaf = tracker_ids_for(&def, &[2040]);
        assert!(leaf.contains(&"100".to_string()));
        assert!(tracker_ids_for(&def, &[]).is_empty());
    }

    #[test]
    fn tracker_id_back_to_newznab() {
        let def = def_with_mappings();
        assert_eq!(newznab_for_tracker_id(&def, "200"), Some(5040));
        assert_eq!(newznab_for_tracker_id(&def, "300"), Some(3000));
        assert_eq!(newznab_for_tracker_id(&def, "999"), None);
    }
}
