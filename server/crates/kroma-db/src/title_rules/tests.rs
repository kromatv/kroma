use super::*;
use crate::testing::{TempPool, temp_pool};

fn seeded() -> TempPool {
    let pool = temp_pool("title-rules");
    pool.get()
        .unwrap()
        .execute_batch(
            r#"INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('films','Films','movies','/m','t');
               INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Alien','mkv','films','t');
               INSERT INTO shows (id,title,library,added_at) VALUES ('s1','Bluey','films','t');
               INSERT INTO items (id,kind,title,container,library,show_id,added_at) VALUES ('e1','episode','Ep','mkv','films','s1','t');
               INSERT INTO users (id,email,username,password_hash,permissions,created_at) VALUES ('u1','a@b.c','kid','h','["playback"]','t');"#,
        )
        .unwrap();
    pool
}

#[test]
fn a_title_carries_one_rule_and_setting_the_other_replaces_it() {
    let pool = seeded();

    set_title_rule(&pool, ("u1", "m1"), Some(TitleRule::Block)).unwrap();
    set_title_rule(&pool, ("u1", "m1"), Some(TitleRule::Allow)).unwrap();

    let rules = title_rules(&pool, "u1").unwrap();
    assert_eq!(rules, HashMap::from([("m1".to_string(), TitleRule::Allow)]));
}

#[test]
fn lifting_a_rule_leaves_the_title_with_none() {
    let pool = seeded();
    set_title_rule(&pool, ("u1", "s1"), Some(TitleRule::Block)).unwrap();

    set_title_rule(&pool, ("u1", "s1"), None).unwrap();

    assert!(title_rules(&pool, "u1").unwrap().is_empty());
}

#[test]
fn a_stored_rule_that_no_longer_parses_reads_as_no_rule() {
    let pool = seeded();
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO profile_title_rules (user_id,title_id,rule,created_at) VALUES ('u1','m1','deny','t')",
            [],
        )
        .unwrap();

    assert!(title_rules(&pool, "u1").unwrap().is_empty());
    assert!(ruled_titles(&pool, "u1").unwrap().is_empty());
}

#[test]
fn the_ruled_titles_are_named_and_a_title_that_left_the_library_drops_out() {
    let pool = seeded();
    set_title_rule(&pool, ("u1", "m1"), Some(TitleRule::Block)).unwrap();
    set_title_rule(&pool, ("u1", "s1"), Some(TitleRule::Allow)).unwrap();
    set_title_rule(&pool, ("u1", "gone"), Some(TitleRule::Allow)).unwrap();

    let mut ruled = ruled_titles(&pool, "u1").unwrap();

    ruled.sort_by(|a, b| a.id.cmp(&b.id));
    assert_eq!(
        ruled,
        vec![
            RuledTitle {
                id: "m1".into(),
                name: "Alien".into(),
                show: false,
                rule: TitleRule::Block
            },
            RuledTitle {
                id: "s1".into(),
                name: "Bluey".into(),
                show: true,
                rule: TitleRule::Allow
            },
        ]
    );
}

#[test]
fn a_profiles_rules_go_with_the_profile() {
    let pool = seeded();
    set_title_rule(&pool, ("u1", "m1"), Some(TitleRule::Block)).unwrap();

    pool.get()
        .unwrap()
        .execute("DELETE FROM users WHERE id = 'u1'", [])
        .unwrap();

    assert!(title_rules(&pool, "u1").unwrap().is_empty());
}
