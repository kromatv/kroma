use kroma_module_sdk::db::testing::temp_pool;
use kroma_module_sdk::host::testing::StubHost;

use super::*;

const ROOT: &str = "/library/Séries";
const RINGS_OF_POWER: u64 = 84773;

fn series_library() -> LibraryFolders {
    LibraryFolders {
        id: "series".into(),
        kind: "shows".into(),
        name: "Séries".into(),
        folders: vec![ROOT.into()],
    }
}

fn templates() -> NamingTemplates {
    NamingTemplates::read(|_, default| default.to_string())
}

fn episode(season: u32, episode: u32) -> NameContext {
    NameContext {
        title: "Le Seigneur des anneaux : Les Anneaux de pouvoir".into(),
        year: Some(2022),
        season: Some(season),
        episode: Some(episode),
        ..Default::default()
    }
}

fn holding(files: &[(&str, u32)]) -> StubHost {
    let pool = temp_pool("acq-series-home");
    let conn = pool.get().unwrap();
    conn.execute_batch(&format!(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('series','Séries','shows','{ROOT}','t');
         INSERT INTO shows (id,library,title,added_at) VALUES ('lotr','series','The Lord of the Rings','t');
         INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','lotr',{RINGS_OF_POWER},0);"
    ))
    .unwrap();
    for (n, (path, season)) in files.iter().enumerate() {
        conn.execute_batch(&format!(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at)
                 VALUES ('e{n}','episode','E','mkv','series','lotr',{season},{n},'t');
             INSERT INTO files (id,item_id,abs_path,container) VALUES ('f{n}','e{n}','{path}','mkv');"
        ))
        .unwrap();
    }
    drop(conn);
    StubHost::with_core(pool)
}

fn destination(host: &StubHost, ctx: &NameContext) -> PathBuf {
    let home = SeriesHome::find(host, Some(RINGS_OF_POWER), &series_library()).unwrap();
    episode_dest(&templates(), home.as_ref(), Path::new(ROOT), ctx, "mkv")
}

#[test]
fn an_episode_of_a_held_series_lands_in_the_season_folder_it_already_has() {
    let host = holding(&[(
        "/library/Séries/The Lord of the Rings/Season 3/Rings - S03E01.mkv",
        3,
    )]);

    let dest = destination(&host, &episode(3, 5));

    assert_eq!(
        dest.parent().unwrap(),
        Path::new("/library/Séries/The Lord of the Rings/Season 3")
    );
}

#[test]
fn a_new_season_of_a_held_series_gets_a_season_folder_inside_the_series() {
    let host = holding(&[
        (
            "/library/Séries/The Lord of the Rings/Season 1/Rings - S01E01.mkv",
            1,
        ),
        (
            "/library/Séries/The Lord of the Rings/Season 2/Rings - S02E01.mkv",
            2,
        ),
    ]);

    let dest = destination(&host, &episode(3, 1));

    assert_eq!(
        dest.parent().unwrap(),
        Path::new("/library/Séries/The Lord of the Rings/Season 03")
    );
}

#[test]
fn a_series_the_library_does_not_hold_gets_a_folder_named_by_the_templates() {
    let host = holding(&[]);
    let ctx = episode(3, 1);

    let dest = destination(&host, &ctx);

    assert_eq!(
        dest,
        Path::new(ROOT).join(templates().episode_rel_path(&ctx, "mkv"))
    );
}

#[test]
fn a_series_held_only_in_another_library_is_not_followed_there() {
    let host = holding(&[(
        "/elsewhere/The Lord of the Rings/Season 1/Rings - S01E01.mkv",
        1,
    )]);
    let ctx = episode(1, 2);

    let dest = destination(&host, &ctx);

    assert_eq!(
        dest,
        Path::new(ROOT).join(templates().episode_rel_path(&ctx, "mkv"))
    );
}

#[test]
fn a_series_split_across_two_folders_follows_the_one_holding_most_of_it() {
    let host = holding(&[
        (
            "/library/Séries/The Lord of the Rings/Season 1/Rings - S01E01.mkv",
            1,
        ),
        (
            "/library/Séries/The Lord of the Rings/Season 1/Rings - S01E02.mkv",
            1,
        ),
        (
            "/library/Séries/Les Anneaux de pouvoir (2022)/Season 03/Anneaux - S03E01.mkv",
            3,
        ),
    ]);

    let dest = destination(&host, &episode(3, 2));

    assert_eq!(
        dest.parent().unwrap(),
        Path::new("/library/Séries/The Lord of the Rings/Season 03")
    );
}

#[test]
fn an_episode_keeps_the_file_name_its_templates_give_it() {
    let host = holding(&[(
        "/library/Séries/The Lord of the Rings/Season 3/Rings - S03E01.mkv",
        3,
    )]);
    let ctx = episode(3, 5);

    let dest = destination(&host, &ctx);

    let named = templates().episode_rel_path(&ctx, "mkv");
    assert_eq!(dest.file_name(), named.file_name());
}
