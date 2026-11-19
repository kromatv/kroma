use std::collections::HashMap;

use super::*;

fn a_catalogue() -> TempPool {
    let pool = pool();
    pool.get()
        .unwrap()
        .execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES
               ('lib','Films','mixed','/media','t');
             INSERT INTO shows (id,library,title,year,added_at) VALUES
               ('dark','lib','Dark',2017,'t'),
               ('fargo','lib','Fargo',NULL,'t');
             INSERT INTO items (id,kind,title,year,container,library,show_id,season,episode,episode_end,added_at) VALUES
               ('heat','movie','Heat',1995,'mkv','lib',NULL,NULL,NULL,NULL,'t'),
               ('heat-4k','movie','Heat',1995,'mkv','lib',NULL,NULL,NULL,NULL,'t'),
               ('ronin','movie','Ronin',1998,'mkv','lib',NULL,NULL,NULL,NULL,'t'),
               ('clip','video','Holiday',1998,'mkv','lib',NULL,NULL,NULL,NULL,'t'),
               ('dark-1-1','episode','Secrets',NULL,'mkv','lib','dark',1,1,NULL,'t'),
               ('dark-1-2','episode','Lies',NULL,'mkv','lib','dark',1,2,3,'t');
             INSERT INTO files (id,item_id,abs_path) VALUES
               ('f1','heat','/media/Heat (1995)/Heat.mkv'),
               ('f2','ronin','/media/Ronin (1998)/Ronin.mkv');
             INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,imdb_id,tvdb_id,updated_at) VALUES
               ('item','heat',949,'tt0113277',NULL,0),
               ('item','heat-4k',949,'tt0113277',NULL,0),
               ('item','ronin',8195,'tt0122690',NULL,0),
               ('item','dark-1-1',949,NULL,NULL,0),
               ('show','dark',70523,'tt5753856',334824,0),
               ('show','gone',949,NULL,NULL,0);",
        )
        .unwrap();
    pool
}

fn tmdb(id: i64) -> CatalogueIds<'static> {
    CatalogueIds {
        tmdb: Some(id),
        ..Default::default()
    }
}

fn named(id: &str, title: &str, year: Option<u32>) -> Named {
    Named {
        id: id.into(),
        title: title.into(),
        year,
        tmdb: None,
        imdb: None,
        tvdb: None,
    }
}

#[test]
fn a_file_is_found_by_its_path_and_a_path_no_file_has_is_absent() {
    let pool = a_catalogue();
    let paths = [
        "/media/Ronin (1998)/Ronin.mkv",
        "/media/Thief (1981)/Thief.mkv",
        "/media/Heat (1995)/Heat.mkv",
    ];

    let found = items_by_file(&pool, &paths).unwrap();

    assert_eq!(
        found,
        HashMap::from([
            ("/media/Heat (1995)/Heat.mkv".into(), "heat".into()),
            ("/media/Ronin (1998)/Ronin.mkv".into(), "ronin".into()),
        ])
    );
}

#[test]
fn more_paths_than_one_statement_binds_are_all_looked_up() {
    let pool = a_catalogue();
    let absent: Vec<String> = (0..2000).map(|n| format!("/media/absent-{n}.mkv")).collect();
    let mut paths: Vec<&str> = absent.iter().map(String::as_str).collect();
    paths.push("/media/Heat (1995)/Heat.mkv");

    let found = items_by_file(&pool, &paths).unwrap();

    assert_eq!(found.len(), 1);
}

#[test]
fn a_film_is_found_by_the_id_another_catalogue_gives_it() {
    let pool = a_catalogue();
    let by_imdb = CatalogueIds {
        imdb: Some("tt0122690"),
        ..Default::default()
    };

    let ronin = film_by_ids(&pool, &tmdb(8195)).unwrap();
    let ronin_again = film_by_ids(&pool, &by_imdb).unwrap();
    let nothing = film_by_ids(&pool, &tmdb(1)).unwrap();
    let no_id = film_by_ids(&pool, &CatalogueIds::default()).unwrap();

    assert_eq!(ronin.as_deref(), Some("ronin"));
    assert_eq!(ronin_again.as_deref(), Some("ronin"));
    assert_eq!((nothing, no_id), (None, None));
}

#[test]
fn the_first_film_in_id_order_answers_where_several_carry_the_id() {
    let pool = a_catalogue();

    let film = film_by_ids(&pool, &tmdb(949)).unwrap();

    assert_eq!(film.as_deref(), Some("heat"));
}

#[test]
fn the_id_tmdb_gives_is_asked_before_the_one_imdb_gives() {
    let pool = a_catalogue();
    let disagreeing = CatalogueIds {
        tmdb: Some(8195),
        imdb: Some("tt0113277"),
        tvdb: None,
    };

    let film = film_by_ids(&pool, &disagreeing).unwrap();

    assert_eq!(film.as_deref(), Some("ronin"));
}

#[test]
fn a_show_is_found_by_its_ids_and_never_as_a_film() {
    let pool = a_catalogue();
    let by_tvdb = CatalogueIds {
        tvdb: Some(334_824),
        ..Default::default()
    };

    let show = show_by_ids(&pool, &tmdb(70523)).unwrap();
    let show_again = show_by_ids(&pool, &by_tvdb).unwrap();
    let as_a_film = film_by_ids(&pool, &tmdb(70523)).unwrap();
    let left_the_catalogue = show_by_ids(&pool, &tmdb(949)).unwrap();

    assert_eq!(show.as_deref(), Some("dark"));
    assert_eq!(show_again.as_deref(), Some("dark"));
    assert_eq!((as_a_film, left_the_catalogue), (None, None));
}

#[test]
fn an_episode_is_found_by_its_numbers_in_a_file_of_one_episode_or_of_several() {
    let pool = a_catalogue();
    let of_dark = |season, episode| EpisodeOf {
        show: "dark",
        season,
        episode,
    };

    let first = episode_item(&pool, &of_dark(1, 1)).unwrap();
    let third = episode_item(&pool, &of_dark(1, 3)).unwrap();
    let fourth = episode_item(&pool, &of_dark(1, 4)).unwrap();
    let next_season = episode_item(&pool, &of_dark(2, 1)).unwrap();

    assert_eq!(first.as_deref(), Some("dark-1-1"));
    assert_eq!(third.as_deref(), Some("dark-1-2"));
    assert_eq!((fourth, next_season), (None, None));
}

#[test]
fn the_films_of_a_year_and_every_show_are_listed_by_name_with_the_ids_this_server_knows() {
    let pool = a_catalogue();
    let ronin = Named {
        tmdb: Some(8195),
        imdb: Some("tt0122690".into()),
        ..named("ronin", "Ronin", Some(1998))
    };
    let dark = Named {
        tmdb: Some(70523),
        imdb: Some("tt5753856".into()),
        tvdb: Some(334_824),
        ..named("dark", "Dark", Some(2017))
    };

    let films = films_of_year(&pool, 1998).unwrap();
    let shows = shows_by_name(&pool).unwrap();

    assert_eq!(films, [named("clip", "Holiday", Some(1998)), ronin]);
    assert_eq!(shows, [dark.clone(), named("fargo", "Fargo", None)]);
    assert_eq!(
        dark.ids(),
        CatalogueIds {
            tmdb: Some(70523),
            imdb: Some("tt5753856"),
            tvdb: Some(334_824),
        }
    );
}

#[test]
fn an_id_stored_as_nothing_is_no_id() {
    let blank = Named {
        imdb: Some(String::new()),
        ..named("heat", "Heat", Some(1995))
    };

    assert_eq!(blank.ids(), CatalogueIds::default());
}
