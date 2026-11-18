use super::*;

fn folder(folder: &str, here: &str) -> KeptFolder {
    KeptFolder {
        folder: folder.into(),
        here: here.into(),
    }
}

fn a_server(pool: &Pool, server: &str) -> String {
    let origin = Origin {
        id: server.into(),
        name: String::new(),
    };
    assert!(queue_from(pool, server, &origin));
    end(pool, server, Status::Completed);
    server_key(IMPORTER, server)
}

#[test]
fn a_server_s_folders_are_kept_with_where_each_is_on_this_machine() {
    let p = pool();
    let server_id = a_server(&p, "srv");
    let answered = [
        folder("/data/movies", "/volume1/video/movies"),
        folder("/data/shows", "/data/shows"),
    ];

    keep_folders(&p, &server_id, &answered).unwrap();

    assert_eq!(kept_folders(&p, &server_id).unwrap(), answered);
}

#[test]
fn a_folder_answered_again_is_kept_once_with_the_newer_answer() {
    let p = pool();
    let server_id = a_server(&p, "srv");
    keep_folders(&p, &server_id, &[folder("/data/movies", "/mnt/old")]).unwrap();

    keep_folders(&p, &server_id, &[folder("/data/movies", "/mnt/new")]).unwrap();

    assert_eq!(
        kept_folders(&p, &server_id).unwrap(),
        vec![folder("/data/movies", "/mnt/new")]
    );
}

#[test]
fn the_folders_of_one_server_are_not_those_of_another() {
    let p = pool();
    let living_room = a_server(&p, "srv");
    let cabin = a_server(&p, "cabin");

    keep_folders(&p, &living_room, &[folder("/data/movies", "/mnt/films")]).unwrap();

    assert!(kept_folders(&p, &cabin).unwrap().is_empty());
}
