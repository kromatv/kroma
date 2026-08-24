//! The media digest: "what's new in the library", batched via a watermark in
//! `settings` rather than emitted per-item (a big re-scan would mean thousands
//! of pushes). New films become one "N new titles" to everyone; new episodes
//! become one per show, to that show's followers. The watermark is seeded, not
//! reported, on the first run, so adopting this on an existing library is silent.

use std::collections::BTreeMap;

use kroma_db::notifications::AddedTitle;
use kroma_module_host::HostStorage;

use kroma_domain::{
    ActionKind, ActionSpec, ActionStyle, Audience, NotificationEvent, NotificationSpec,
    PushCategory,
};

use crate::db;

// Setting holding the ISO-8601 `added_at` we have already reported through.
pub const WATERMARK_KEY: &str = "notifications.digest.since";

// Rows per run; a bigger burst still gets reported across multiple runs (the
// watermark still advances) rather than loaded into memory at once.
const MAX_SCAN: usize = 5_000;

/// What a run did, for the job log.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct DigestSummary {
    pub movies: usize,
    pub shows: usize,
    pub sent: usize,
    pub seeded: bool,
}

/// Report everything added since the watermark, then advance it.
pub fn run<S: HostStorage>(state: &S) -> anyhow::Result<DigestSummary> {
    let since = state.setting_str(WATERMARK_KEY, "");
    let conn = state.db().get()?;

    // First run on an existing library: adopt the current head and say nothing.
    if since.is_empty() {
        let head = db::notifications::newest_added_at(&conn)?.unwrap_or_default();
        drop(conn);
        set_watermark(state, &head);
        return Ok(DigestSummary {
            seeded: true,
            ..Default::default()
        });
    }

    let added = db::notifications::items_added_since(&conn, &since, MAX_SCAN)?;
    drop(conn);
    if added.is_empty() {
        return Ok(DigestSummary::default());
    }
    // `items_added_since` is newest-first, so the head is the new watermark.
    let newest = added[0].added_at.clone();

    let (movies, episodes) = split(added);
    let mut summary = DigestSummary {
        movies: movies.len(),
        shows: episodes.len(),
        ..Default::default()
    };
    summary.sent += announce_movies(state, &movies);
    for (show_id, eps) in &episodes {
        summary.sent += announce_episodes(state, show_id, eps);
    }

    set_watermark(state, &newest);
    Ok(summary)
}

fn set_watermark<S: HostStorage>(state: &S, value: &str) {
    state.set_settings(BTreeMap::from([(
        WATERMARK_KEY.to_string(),
        serde_json::Value::String(value.to_string()),
    )]));
}

// Partitions the additions into standalone titles and episodes grouped by show.
fn split(added: Vec<AddedTitle>) -> (Vec<AddedTitle>, BTreeMap<String, Vec<AddedTitle>>) {
    let mut movies = Vec::new();
    let mut episodes: BTreeMap<String, Vec<AddedTitle>> = BTreeMap::new();
    for item in added {
        match item.show_id.clone() {
            // An episode belongs to its show's followers, not to everyone.
            Some(show_id) if item.kind == "episode" => {
                episodes.entry(show_id).or_default().push(item);
            }
            _ => movies.push(item),
        }
    }
    (movies, episodes)
}

// A single new film names itself and links straight to it; a batch reports the
// count and opens the list.
fn announce_movies<S: HostStorage>(state: &S, movies: &[AddedTitle]) -> usize {
    let Some(newest) = movies.first() else {
        return 0;
    };
    let single = movies.len() == 1;
    let spec = if single {
        NotificationSpec::new(
            NotificationEvent::MediaAdded,
            "notifications.media.added.title",
            "notifications.media.addedOne.body",
        )
        .param("title", newest.title.clone())
        .link(format!("/movie/{}", newest.id))
        .image(newest.poster_url.clone())
        .push_category(PushCategory::MediaAvailable)
        .action(ActionSpec {
            id: "watch".into(),
            label_key: "notifications.action.watch".into(),
            kind: ActionKind::Link,
            href: format!("/movie/{}", newest.id),
            method: None,
            style: ActionStyle::Primary,
        })
    } else {
        NotificationSpec::new(
            NotificationEvent::MediaAdded,
            "notifications.media.added.title",
            "notifications.media.added.body",
        )
        .param("count", movies.len().to_string())
        // Name the newest anyway: "12 new titles" is a lot less enticing than
        // knowing one of them is the film you have been waiting for.
        .param("title", newest.title.clone())
        .image(newest.poster_url.clone())
        .link("/films")
    };
    super::emit(state, &Audience::Everyone, &spec)
}

// One notification per show, to its followers only.
fn announce_episodes<S: HostStorage>(state: &S, show_id: &str, eps: &[AddedTitle]) -> usize {
    let Some(newest) = eps.first() else {
        return 0;
    };
    let show_title = newest
        .show_title
        .clone()
        .unwrap_or_else(|| newest.title.clone());
    // "S01E04" for a single episode, "4 new episodes" for a batch a season drop
    // should read as one arrival, not four. Only the body key and its one var
    // differ; title key, link, push category and audience are the same either way.
    let (body_key, (var, value)) = match (eps.len(), newest.season, newest.episode) {
        (1, Some(s), Some(e)) => (
            "notifications.media.episode.body",
            ("episode", format!("S{s:02}E{e:02}")),
        ),
        (n, ..) => (
            "notifications.media.episodeMany.body",
            ("count", n.to_string()),
        ),
    };
    let spec = NotificationSpec::new(
        NotificationEvent::MediaEpisode,
        "notifications.media.episode.title",
        body_key,
    )
    .param("title", show_title)
    .param(var, value)
    .link(format!("/show/{show_id}"))
    .image(newest.poster_url.clone())
    .push_category(PushCategory::MediaAvailable);
    super::emit(state, &Audience::followers(show_id), &spec)
}

#[cfg(test)]
mod tests {
    use kroma_module_host::HostCtx;

    use super::*;
    use crate::test_support;
    use kroma_domain::ParamValue;

    // A state with one account and one library, so digest runs have somewhere to
    // read from and someone to tell.
    fn seeded() -> (crate::state::SharedState, String) {
        let state = test_support::test_state();
        let user = kroma_db::create_user(&state.db, "ana@test.dev", "Ana", "h", &[])
            .unwrap()
            .id;
        let conn = state.db.get().unwrap();
        conn.execute(
            "INSERT INTO libraries (id,name,kind,path,added_at) \
             VALUES ('lib','Films','movies','/x','2020-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        drop(conn);
        (state, user)
    }

    // `rusqlite` isn't a dependency of this crate, so this interpolates raw SQL;
    // the literals are test constants, never external input.
    fn add_movie(state: &crate::state::SharedState, id: &str, title: &str, added_at: &str) {
        let conn = state.db.get().unwrap();
        conn.execute_batch(&format!(
            "INSERT INTO items (id,kind,title,container,library,added_at) \
             VALUES ('{id}','movie','{title}','mkv','lib','{added_at}')"
        ))
        .unwrap();
    }

    fn add_poster(state: &crate::state::SharedState, kind: &str, id: &str, url: &str) {
        let conn = state.db.get().unwrap();
        conn.execute_batch(&format!(
            "INSERT INTO metadata_core (subject_kind,subject_id,poster_url,updated_at) \
             VALUES ('{kind}','{id}','{url}',0)"
        ))
        .unwrap();
    }

    fn unread(state: &crate::state::SharedState, user: &str) -> u32 {
        let conn = state.db.get().unwrap();
        db::notifications::unread_count(&conn, user).unwrap()
    }

    #[test]
    fn the_first_run_adopts_the_library_and_notifies_nobody() {
        let (state, user) = seeded();
        add_movie(&state, "m1", "Dune", "2026-01-01T00:00:00Z");
        add_movie(&state, "m2", "Arrival", "2026-01-02T00:00:00Z");

        let summary = run(&state).unwrap();
        assert!(summary.seeded);
        assert_eq!(summary.sent, 0);
        // Adopting a 4000-film library must not produce 4000 notifications.
        assert_eq!(unread(&state, &user), 0);
        // The watermark is the newest title present.
        assert_eq!(state.setting_str(WATERMARK_KEY, ""), "2026-01-02T00:00:00Z");
    }

    #[test]
    fn a_title_added_after_the_watermark_is_announced_once() {
        let (state, user) = seeded();
        add_movie(&state, "m1", "Dune", "2026-01-01T00:00:00Z");
        run(&state).unwrap(); // seed

        add_movie(&state, "m2", "Arrival", "2026-01-03T00:00:00Z");
        let summary = run(&state).unwrap();
        assert!(!summary.seeded);
        assert_eq!(summary.movies, 1);
        assert_eq!(summary.sent, 1);
        assert_eq!(unread(&state, &user), 1);

        // A second run with nothing new stays silent, and does not re-announce.
        let again = run(&state).unwrap();
        assert_eq!(again.movies, 0);
        assert_eq!(again.sent, 0);
        assert_eq!(unread(&state, &user), 1);
    }

    #[test]
    fn a_single_new_film_links_straight_to_it() {
        let (state, user) = seeded();
        add_movie(&state, "m1", "Dune", "2026-01-01T00:00:00Z");
        run(&state).unwrap();
        add_movie(&state, "m2", "Arrival", "2026-01-03T00:00:00Z");
        run(&state).unwrap();

        let conn = state.db.get().unwrap();
        let rows = db::notifications::list_notifications(&conn, &user, 10, false).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].link.as_deref(), Some("/movie/m2"));
        assert_eq!(
            rows[0].params.get("title"),
            Some(&ParamValue::Text("Arrival".into()))
        );
        // A lone arrival is worth a Watch button.
        assert_eq!(rows[0].actions.len(), 1);
    }

    #[test]
    fn a_new_film_carries_its_poster() {
        let (state, user) = seeded();
        add_movie(&state, "m1", "Dune", "2026-01-01T00:00:00Z");
        run(&state).unwrap();
        add_movie(&state, "m2", "Arrival", "2026-01-03T00:00:00Z");
        add_poster(&state, "item", "m2", "/api/images/arrival.webp");
        run(&state).unwrap();

        let conn = state.db.get().unwrap();
        let rows = db::notifications::list_notifications(&conn, &user, 10, false).unwrap();
        assert_eq!(
            rows[0].image_url.as_deref(),
            Some("/api/images/arrival.webp")
        );
    }

    #[test]
    fn a_batch_becomes_one_notification_that_counts_them() {
        let (state, user) = seeded();
        add_movie(&state, "m0", "Seed", "2026-01-01T00:00:00Z");
        run(&state).unwrap();
        for (i, title) in ["A", "B", "C"].iter().enumerate() {
            add_movie(
                &state,
                &format!("m{i}x"),
                title,
                &format!("2026-01-0{}T00:00:00Z", i + 3),
            );
        }

        let summary = run(&state).unwrap();
        assert_eq!(summary.movies, 3);
        // THREE new films, ONE notification.
        assert_eq!(summary.sent, 1);
        assert_eq!(unread(&state, &user), 1);

        let conn = state.db.get().unwrap();
        let rows = db::notifications::list_notifications(&conn, &user, 10, false).unwrap();
        assert_eq!(
            rows[0].params.get("count"),
            Some(&ParamValue::Text("3".into()))
        );
        assert_eq!(rows[0].link.as_deref(), Some("/films"));
    }

    #[test]
    fn muting_the_media_category_silences_the_digest_for_that_user() {
        let (state, user) = seeded();
        add_movie(&state, "m1", "Dune", "2026-01-01T00:00:00Z");
        run(&state).unwrap();
        db::notifications::set_prefs(
            &state.db,
            &user,
            &[kroma_domain::CategoryPref {
                category: kroma_domain::NotificationCategory::Media,
                in_app: false,
                push: false,
            }],
        )
        .unwrap();

        add_movie(&state, "m2", "Arrival", "2026-01-03T00:00:00Z");
        let summary = run(&state).unwrap();
        // The digest still ran and still advanced; it just reached nobody.
        assert_eq!(summary.movies, 1);
        assert_eq!(summary.sent, 0);
        assert_eq!(unread(&state, &user), 0);
        assert_eq!(state.setting_str(WATERMARK_KEY, ""), "2026-01-03T00:00:00Z");
    }

    fn movie(id: &str, title: &str, added: &str) -> AddedTitle {
        AddedTitle {
            id: id.into(),
            kind: "movie".into(),
            title: title.into(),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            added_at: added.into(),
            poster_url: Some(format!("/api/images/{id}.webp")),
        }
    }

    fn episode(id: &str, show: &str, season: u32, ep: u32) -> AddedTitle {
        AddedTitle {
            id: id.into(),
            kind: "episode".into(),
            title: format!("Episode {ep}"),
            show_id: Some(show.into()),
            show_title: Some("The Office".into()),
            season: Some(season),
            episode: Some(ep),
            added_at: "2026-01-01T00:00:00Z".into(),
            poster_url: Some(format!("/api/images/{show}.webp")),
        }
    }

    #[test]
    fn split_separates_films_from_episodes_grouped_by_show() {
        let (movies, shows) = split(vec![
            movie("m1", "Dune", "2026-01-02T00:00:00Z"),
            episode("e1", "showA", 1, 1),
            episode("e2", "showA", 1, 2),
            episode("e3", "showB", 3, 7),
        ]);
        assert_eq!(movies.len(), 1);
        assert_eq!(shows.len(), 2);
        assert_eq!(shows["showA"].len(), 2);
        assert_eq!(shows["showB"].len(), 1);
    }

    #[test]
    fn an_episode_without_a_show_id_is_treated_as_a_standalone_title() {
        // Defensive: an orphan episode row must still be reported, not dropped.
        let mut orphan = episode("e1", "showA", 1, 1);
        orphan.show_id = None;
        let (movies, shows) = split(vec![orphan]);
        assert_eq!(movies.len(), 1);
        assert!(shows.is_empty());
    }

    #[test]
    fn a_non_episode_row_carrying_a_show_id_stays_a_standalone_title() {
        // `kind` is the discriminator, not the mere presence of `show_id`.
        let mut odd = movie("m1", "Special", "2026-01-02T00:00:00Z");
        odd.show_id = Some("showA".into());
        let (movies, shows) = split(vec![odd]);
        assert_eq!(movies.len(), 1);
        assert!(shows.is_empty());
    }

    // A show plus a follower, so an episode announcement has an audience.
    fn add_show(state: &crate::state::SharedState, show_id: &str, title: &str, follower: &str) {
        let conn = state.db.get().unwrap();
        conn.execute_batch(&format!(
            "INSERT INTO libraries (id,name,kind,path,added_at) \
               VALUES ('lib-tv','Séries','shows','/tv','2020-01-01T00:00:00Z'); \
             INSERT INTO shows (id,library,title,added_at) \
               VALUES ('{show_id}','lib-tv','{title}','2020-01-01T00:00:00Z'); \
             INSERT INTO my_list (user_id,item_id,added_at) VALUES ('{follower}','{show_id}',0);"
        ))
        .unwrap();
    }

    fn add_episode(
        state: &crate::state::SharedState,
        id: &str,
        show_id: &str,
        season: u32,
        episode: u32,
        added_at: &str,
    ) {
        let conn = state.db.get().unwrap();
        conn.execute_batch(&format!(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES ('{id}','episode','Ep {episode}','mkv','lib-tv','{show_id}',{season},{episode},'{added_at}')"
        ))
        .unwrap();
    }

    // The notification bodies a user was sent, newest first.
    fn bodies(state: &crate::state::SharedState, user: &str) -> Vec<String> {
        let conn = state.db.get().unwrap();
        db::notifications::list_notifications(&conn, user, 20, false)
            .unwrap()
            .into_iter()
            .map(|n| n.body_key)
            .collect()
    }

    // Needs a title present: the watermark is the newest `added_at`, so adopting
    // an EMPTY library leaves it empty and the next run seeds again.
    fn adopt(state: &crate::state::SharedState) {
        add_movie(state, "baseline", "Baseline", "2020-01-01T00:00:00Z");
        let seeded = run(state).unwrap();
        assert!(seeded.seeded, "the baseline should have been adopted");
    }

    #[test]
    fn an_empty_library_keeps_seeding_until_it_has_something() {
        // The watermark is the newest `added_at`, so an empty library adopts ""
        // and the next run adopts again; the first film is therefore silent by
        // design, not a bug - a fresh install should not notify about its own import.
        let (state, user) = seeded();
        assert!(run(&state).unwrap().seeded);
        assert_eq!(state.setting_str(WATERMARK_KEY, ""), "");

        add_movie(&state, "m1", "Dune", "2026-01-01T00:00:00Z");
        let second = run(&state).unwrap();
        assert!(second.seeded, "still adopting, not announcing");
        assert_eq!(second.sent, 0);
        assert_eq!(unread(&state, &user), 0);
        assert_eq!(state.setting_str(WATERMARK_KEY, ""), "2026-01-01T00:00:00Z");
    }

    #[test]
    fn a_single_new_episode_is_announced_by_its_number() {
        let (state, user) = seeded();
        add_show(&state, "shw", "Severance", &user);
        adopt(&state);

        add_episode(&state, "e1", "shw", 1, 4, "2026-02-01T00:00:00Z");
        let summary = run(&state).unwrap();
        assert_eq!(summary.sent, 1);
        assert_eq!(unread(&state, &user), 1);
        assert_eq!(bodies(&state, &user), ["notifications.media.episode.body"]);
    }

    #[test]
    fn a_new_episode_carries_the_shows_poster() {
        // The episode's own art is a still; the show's poster is what a
        // notification should show.
        let (state, user) = seeded();
        add_show(&state, "shw", "Severance", &user);
        add_poster(&state, "show", "shw", "/api/images/severance.webp");
        adopt(&state);

        add_episode(&state, "e1", "shw", 1, 4, "2026-02-01T00:00:00Z");
        run(&state).unwrap();

        let conn = state.db.get().unwrap();
        let rows = db::notifications::list_notifications(&conn, &user, 10, false).unwrap();
        assert_eq!(
            rows[0].image_url.as_deref(),
            Some("/api/images/severance.webp")
        );
    }

    #[test]
    fn a_season_drop_reads_as_one_arrival_not_four() {
        // The whole reason the batch branch exists: ten episodes landing at once
        // is one thing that happened, and ten notifications would be a reason to
        // turn the feature off.
        let (state, user) = seeded();
        add_show(&state, "shw", "Severance", &user);
        adopt(&state);

        for ep in 1..=4 {
            add_episode(
                &state,
                &format!("e{ep}"),
                "shw",
                1,
                ep,
                "2026-02-01T00:00:00Z",
            );
        }
        let summary = run(&state).unwrap();
        assert_eq!(summary.sent, 1, "one notification, not four");
        assert_eq!(unread(&state, &user), 1);
        // ...and it uses the plural body, which carries the count.
        assert_eq!(
            bodies(&state, &user),
            ["notifications.media.episodeMany.body"]
        );
    }

    #[test]
    fn each_show_is_announced_separately() {
        // Two shows updating on the same night are two arrivals, addressed to
        // each show's own followers.
        let (state, ana) = seeded();
        let bo = kroma_db::create_user(&state.db, "bo@test.dev", "Bo", "h", &[])
            .unwrap()
            .id;
        add_show(&state, "shw-a", "Severance", &ana);
        {
            let conn = state.db.get().unwrap();
            conn.execute_batch(
                "INSERT INTO shows (id,library,title,added_at) \
                   VALUES ('shw-b','lib-tv','Andor','2020-01-01T00:00:00Z'); \
                 INSERT INTO my_list (user_id,item_id,added_at) VALUES ('BO','shw-b',0);"
                    .replace("BO", &bo)
                    .as_str(),
            )
            .unwrap();
        }
        adopt(&state);

        add_episode(&state, "a1", "shw-a", 1, 1, "2026-02-01T00:00:00Z");
        add_episode(&state, "b1", "shw-b", 1, 1, "2026-02-01T00:00:00Z");
        let summary = run(&state).unwrap();
        assert_eq!(summary.sent, 2);
        // Each follower hears about their own show only.
        assert_eq!(unread(&state, &ana), 1);
        assert_eq!(unread(&state, &bo), 1);
    }

    #[test]
    fn an_episode_nobody_follows_notifies_nobody() {
        // The audience is the show's followers, so a series no account has
        // touched is silent - it is not news to anyone.
        let (state, user) = seeded();
        {
            let conn = state.db.get().unwrap();
            conn.execute_batch(
                "INSERT INTO libraries (id,name,kind,path,added_at) \
                   VALUES ('lib-tv','Séries','shows','/tv','2020-01-01T00:00:00Z'); \
                 INSERT INTO shows (id,library,title,added_at) \
                   VALUES ('shw','lib-tv','Unwatched','2020-01-01T00:00:00Z');",
            )
            .unwrap();
        }
        adopt(&state);

        add_episode(&state, "e1", "shw", 1, 1, "2026-02-01T00:00:00Z");
        let summary = run(&state).unwrap();
        assert_eq!(summary.sent, 0);
        assert_eq!(unread(&state, &user), 0);
    }

    #[test]
    fn movies_and_episodes_in_one_night_are_announced_separately() {
        // Films go to Everyone; episodes go to each show's followers. Merging
        // them would tell the whole household about a series they do not watch.
        let (state, user) = seeded();
        add_show(&state, "shw", "Severance", &user);
        adopt(&state);

        add_movie(&state, "m9", "Dune", "2026-02-01T00:00:00Z");
        add_episode(&state, "e1", "shw", 1, 1, "2026-02-01T00:00:00Z");
        let summary = run(&state).unwrap();
        assert_eq!(summary.sent, 2, "one for the film, one for the show");
        assert_eq!(unread(&state, &user), 2);
    }
}
