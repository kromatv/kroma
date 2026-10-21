use std::collections::{HashMap, HashSet};

use super::status::{status_of, tr, Ledger};
use crate::db::pipeline::RawItem;
use crate::model::Treatment;

pub(super) fn element_title(it: &RawItem) -> String {
    if it.kind != "episode" {
        return it.title.clone();
    }
    let show = it.show_title.clone().unwrap_or_default();
    let code = match (it.season, it.episode) {
        (Some(s), Some(e)) => format!("S{s:02}E{e:02}"),
        _ => String::new(),
    };
    let base = match (show.is_empty(), code.is_empty()) {
        (false, false) => format!("{show} - {code}"),
        (false, true) => show,
        (true, false) => code,
        (true, true) => it.title.clone(),
    };
    match &it.episode_title {
        Some(t) if !t.is_empty() => format!("{base} « {t} »"),
        _ => base,
    }
}

pub(super) struct Ledgers<'a, 'k> {
    pub(super) probed: &'a HashSet<String>,
    pub(super) markset: &'a HashSet<String>,
    pub(super) vecset: &'a HashSet<String>,
    pub(super) meta_l: &'a Ledger,
    pub(super) story_l: &'a Ledger,
    pub(super) subs_l: &'a Ledger,
    pub(super) embed_l: &'a Ledger,
    pub(super) mark_l: &'a Ledger,
    pub(super) credits_l: &'a Ledger,
    pub(super) show_poster: &'a HashMap<&'k str, Option<String>>,
}

pub(super) fn group_episodes_by_show(items: &[RawItem]) -> HashMap<&str, Vec<&RawItem>> {
    let mut ep_by_show: HashMap<&str, Vec<&RawItem>> = HashMap::new();
    for it in items {
        if it.kind == "episode" {
            if let Some(sid) = &it.show_id {
                ep_by_show.entry(sid.as_str()).or_default().push(it);
            }
        }
    }
    ep_by_show
}

pub(super) fn item_treatments(
    it: &RawItem,
    lg: &Ledgers<'_, '_>,
) -> (Vec<Treatment>, &'static str, Option<String>) {
    if it.kind == "episode" {
        let (p, _) = status_of(None, lg.probed.contains(&it.id), false);
        let (s, se) = status_of(lg.story_l.get(&it.id), false, true);
        let season_key = match (it.show_id.as_deref(), it.season) {
            (Some(sh), Some(n)) => Some(format!("{sh}#{n}")),
            _ => None,
        };
        let (mk, mke) = status_of(
            season_key.as_deref().and_then(|k| lg.mark_l.get(k)),
            lg.markset.contains(&it.id),
            true,
        );
        let (st, ste) = status_of(lg.subs_l.get(&it.id), false, true);
        let poster = it
            .show_id
            .as_deref()
            .and_then(|sid| lg.show_poster.get(sid).cloned().flatten());
        (
            vec![
                tr("probe", p, None),
                tr("storyboard", s, se),
                tr("subtitles", st, ste),
                tr("markers", mk, mke),
            ],
            "episode",
            poster,
        )
    } else {
        let (p, _) = status_of(None, lg.probed.contains(&it.id), false);
        let (m, me) = status_of(lg.meta_l.get(&it.id), it.has_meta, false);
        let (s, se) = status_of(lg.story_l.get(&it.id), false, true);
        let (st, ste) = status_of(lg.subs_l.get(&it.id), false, true);
        let (c, ce) = status_of(lg.credits_l.get(&it.id), lg.markset.contains(&it.id), true);
        let (e, ee) = status_of(lg.embed_l.get(&it.id), lg.vecset.contains(&it.id), false);
        (
            vec![
                tr("probe", p, None),
                tr("metadata", m, me),
                tr("storyboard", s, se),
                tr("subtitles", st, ste),
                tr("credits", c, ce),
                tr("embed", e, ee),
            ],
            "film",
            it.poster.clone(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw_item(kind: &str) -> RawItem {
        RawItem {
            id: "id1".into(),
            kind: kind.into(),
            title: "Some Title".into(),
            year: Some(2020),
            duration_ms: Some(6_000_000),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            episode_title: None,
            has_meta: false,
            poster: None,
            genre: None,
        }
    }

    #[test]
    fn element_title_movie_is_plain_title() {
        assert_eq!(element_title(&raw_item("film")), "Some Title");
    }

    #[test]
    fn element_title_episode_composes_show_code_and_name() {
        let mut ep = raw_item("episode");
        ep.show_title = Some("Breaking Bad".into());
        ep.season = Some(2);
        ep.episode = Some(5);
        ep.episode_title = Some("Breakage".into());
        assert_eq!(element_title(&ep), "Breaking Bad - S02E05 « Breakage »");

        ep.episode_title = None;
        assert_eq!(element_title(&ep), "Breaking Bad - S02E05");

        ep.season = None;
        ep.episode = None;
        assert_eq!(element_title(&ep), "Breaking Bad");

        ep.show_title = None;
        assert_eq!(element_title(&ep), "Some Title");
    }

    #[test]
    fn group_episodes_by_show_keys_on_show_id() {
        let mut a = raw_item("episode");
        a.id = "a".into();
        a.show_id = Some("show1".into());
        let mut b = raw_item("episode");
        b.id = "b".into();
        b.show_id = Some("show1".into());
        let mut movie = raw_item("film");
        movie.id = "m".into();
        let mut orphan = raw_item("episode");
        orphan.id = "o".into();
        orphan.show_id = None;

        let items = vec![a, b, movie, orphan];
        let grouped = group_episodes_by_show(&items);
        assert_eq!(grouped.len(), 1);
        assert_eq!(grouped.get("show1").map(|v| v.len()), Some(2));
    }

    #[test]
    fn item_treatments_film_carries_five_stages_with_ledger_and_artifacts() {
        use std::collections::{HashMap, HashSet};
        let probed: HashSet<String> = ["m1".to_string()].into_iter().collect();
        let markset: HashSet<String> = HashSet::new();
        let vecset: HashSet<String> = ["m1".to_string()].into_iter().collect();
        let empty: Ledger = HashMap::new();
        let meta_l: Ledger = [(
            "m1".to_string(),
            ("failed".to_string(), Some("boom".to_string())),
        )]
        .into_iter()
        .collect();
        let show_poster: HashMap<&str, Option<String>> = HashMap::new();
        let lg = Ledgers {
            probed: &probed,
            markset: &markset,
            vecset: &vecset,
            meta_l: &meta_l,
            story_l: &empty,
            subs_l: &empty,
            embed_l: &empty,
            mark_l: &empty,
            credits_l: &empty,
            show_poster: &show_poster,
        };

        let mut movie = raw_item("film");
        movie.id = "m1".into();
        movie.poster = Some("p.jpg".into());
        let (treatments, kind, poster) = item_treatments(&movie, &lg);
        assert_eq!(kind, "film");
        assert_eq!(poster.as_deref(), Some("p.jpg"));
        let keys: Vec<&str> = treatments.iter().map(|t| t.key.as_str()).collect();
        assert_eq!(
            keys,
            vec![
                "probe",
                "metadata",
                "storyboard",
                "subtitles",
                "credits",
                "embed"
            ]
        );
        let by = |k: &str| treatments.iter().find(|t| t.key == k).unwrap();
        assert_eq!(by("probe").status, "done");
        assert_eq!(by("metadata").status, "failed");
        assert_eq!(by("metadata").error.as_deref(), Some("boom"));
        assert_eq!(by("embed").status, "done");
        assert_eq!(by("storyboard").status, "done");
    }

    #[test]
    fn an_episode_with_no_season_gets_markers_without_a_season_key() {
        use std::collections::{HashMap, HashSet};
        let probed: HashSet<String> = HashSet::new();
        let markset: HashSet<String> = HashSet::new();
        let vecset: HashSet<String> = HashSet::new();
        let empty: Ledger = HashMap::new();
        let show_poster: HashMap<&str, Option<String>> = HashMap::new();
        let lg = Ledgers {
            probed: &probed,
            markset: &markset,
            vecset: &vecset,
            meta_l: &empty,
            story_l: &empty,
            subs_l: &empty,
            embed_l: &empty,
            mark_l: &empty,
            credits_l: &empty,
            show_poster: &show_poster,
        };

        let mut ep = raw_item("episode");
        ep.show_id = Some("s1".into());
        ep.season = None;
        let (treatments, kind, poster) = item_treatments(&ep, &lg);
        assert_eq!(kind, "episode");
        assert!(poster.is_none());
        let keys: Vec<&str> = treatments.iter().map(|t| t.key.as_str()).collect();
        assert_eq!(keys, vec!["probe", "storyboard", "subtitles", "markers"]);
    }

    #[test]
    fn item_treatments_episode_has_four_stages_and_show_poster() {
        use std::collections::{HashMap, HashSet};
        let probed: HashSet<String> = HashSet::new();
        let markset: HashSet<String> = HashSet::new();
        let vecset: HashSet<String> = HashSet::new();
        let empty: Ledger = HashMap::new();
        let show_poster: HashMap<&str, Option<String>> =
            [("s1", Some("show.jpg".to_string()))].into_iter().collect();
        let lg = Ledgers {
            probed: &probed,
            markset: &markset,
            vecset: &vecset,
            meta_l: &empty,
            story_l: &empty,
            subs_l: &empty,
            embed_l: &empty,
            mark_l: &empty,
            credits_l: &empty,
            show_poster: &show_poster,
        };

        let mut ep = raw_item("episode");
        ep.id = "e1".into();
        ep.show_id = Some("s1".into());
        ep.season = Some(1);
        let (treatments, kind, poster) = item_treatments(&ep, &lg);
        assert_eq!(kind, "episode");
        assert_eq!(poster.as_deref(), Some("show.jpg"));
        let keys: Vec<&str> = treatments.iter().map(|t| t.key.as_str()).collect();
        assert_eq!(keys, vec!["probe", "storyboard", "subtitles", "markers"]);
        let by = |k: &str| treatments.iter().find(|t| t.key == k).unwrap();
        assert_eq!(by("probe").status, "pending");
        assert_eq!(by("storyboard").status, "done");
        assert_eq!(by("markers").status, "done");
    }
}
