use super::*;

fn a_show(pool: &Pool, id: &str) {
    a_film(pool, "heat");
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO shows (id,library,title,year,added_at) VALUES (?1,'lib',?1,2017,'t')",
            [id],
        )
        .unwrap();
}

#[test]
fn a_favourite_on_a_show_is_saved_to_the_list_once() {
    let pool = pool();
    let ana = an_account(&pool, "ana");
    a_show(&pool, "dark");

    let first = merge(&pool, &ana, Place::Show("dark"), favourite());
    let second = merge(&pool, &ana, Place::Show("dark"), favourite());

    assert_eq!((first, second), (Merged::Changed, Merged::Unchanged));
    assert_eq!(saved(&pool), ["dark"]);
}

#[test]
fn a_show_that_left_the_server_takes_no_favourite() {
    let pool = pool();
    let ana = an_account(&pool, "ana");

    let merged = merge(&pool, &ana, Place::Show("dark"), favourite());

    assert_eq!(merged, Merged::Gone);
    assert!(saved(&pool).is_empty());
}

#[test]
fn a_favourite_taken_off_a_show_here_does_not_come_back_with_an_older_time() {
    let pool = pool();
    let ana = an_account(&pool, "ana");
    a_show(&pool, "dark");
    merge(&pool, &ana, Place::Show("dark"), favourite());
    crate::remove_from_list(&pool, &ana, "dark").unwrap();

    let merged = merge(&pool, &ana, Place::Show("dark"), favourite());

    assert_eq!(merged, Merged::Unchanged);
    assert!(saved(&pool).is_empty());
}
