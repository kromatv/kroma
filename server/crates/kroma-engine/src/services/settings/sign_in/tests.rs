use super::*;
use crate::db::testing::TempPool;

fn pool() -> TempPool {
    crate::db::testing::temp_pool("settings-sign-in")
}

fn provider(id: &str) -> Provider {
    Provider {
        id: id.to_string(),
        label: "Home".to_string(),
        issuer: "https://id.test".to_string(),
        client_id: "kroma".to_string(),
        client_secret: "s3cret".to_string(),
        ..Provider::default()
    }
}

fn with(providers: Vec<Provider>) -> SignIn {
    SignIn {
        providers,
        ..SignIn::default()
    }
}

fn env() -> ProviderEnv {
    ProviderEnv {
        issuer: "https://env.test".to_string(),
        client_id: "from-env".to_string(),
        client_secret: "env-secret".to_string(),
        label: String::new(),
    }
}

fn tested(settings: &Settings, pool: &Pool, id: &str) {
    let fingerprint = sign_in(settings, None).provider(id).unwrap().fingerprint();
    mark_provider_tested(settings, pool, id, &fingerprint);
}

#[test]
fn a_server_nobody_configured_offers_passwords_and_passkeys_and_no_provider() {
    let pool = pool();

    let config = sign_in(&Settings::load(&pool), None);

    assert!(config.password && config.passkeys);
    assert!(config.providers.is_empty());
}

#[test]
fn a_saved_provider_is_not_live_until_a_test_passed() {
    let pool = pool();
    let settings = Settings::load(&pool);

    set_sign_in(&settings, &pool, None, with(vec![provider("p0")])).unwrap();
    assert_eq!(sign_in(&settings, None).live().count(), 0);

    tested(&settings, &pool, "p0");

    assert_eq!(sign_in(&settings, None).live().count(), 1);
}

#[test]
fn changing_the_connection_takes_a_provider_offline_until_it_is_tested_again() {
    let pool = pool();
    let settings = Settings::load(&pool);
    set_sign_in(&settings, &pool, None, with(vec![provider("p0")])).unwrap();
    tested(&settings, &pool, "p0");

    let mut moved = provider("p0");
    moved.issuer = "https://elsewhere.test".to_string();
    set_sign_in(&settings, &pool, None, with(vec![moved])).unwrap();

    assert_eq!(sign_in(&settings, None).live().count(), 0);
}

#[test]
fn changing_who_may_come_in_keeps_a_provider_live() {
    let pool = pool();
    let settings = Settings::load(&pool);
    set_sign_in(&settings, &pool, None, with(vec![provider("p0")])).unwrap();
    tested(&settings, &pool, "p0");

    let mut stricter = provider("p0");
    stricter.required_groups = vec!["family".to_string()];
    stricter.new_people = NewPeople::Create;
    stricter.label = "Family".to_string();
    set_sign_in(&settings, &pool, None, with(vec![stricter])).unwrap();

    assert_eq!(sign_in(&settings, None).live().count(), 1);
}

#[test]
fn a_blank_secret_keeps_the_stored_one_and_a_new_one_replaces_it() {
    let pool = pool();
    let settings = Settings::load(&pool);
    set_sign_in(&settings, &pool, None, with(vec![provider("p0")])).unwrap();

    let mut blank = provider("p0");
    blank.client_secret = String::new();
    set_sign_in(&settings, &pool, None, with(vec![blank])).unwrap();
    assert_eq!(sign_in(&settings, None).providers[0].client_secret, "s3cret");

    let mut rotated = provider("p0");
    rotated.client_secret = "next".to_string();
    set_sign_in(&settings, &pool, None, with(vec![rotated])).unwrap();
    assert_eq!(sign_in(&settings, None).providers[0].client_secret, "next");
}

#[test]
fn a_test_the_client_claims_is_never_believed() {
    let pool = pool();
    let settings = Settings::load(&pool);
    let mut forged = provider("p0");
    forged.tested = forged.fingerprint();

    set_sign_in(&settings, &pool, None, with(vec![forged])).unwrap();

    assert_eq!(sign_in(&settings, None).live().count(), 0);
}

#[test]
fn a_test_against_a_connection_that_has_since_changed_is_not_recorded() {
    let pool = pool();
    let settings = Settings::load(&pool);
    set_sign_in(&settings, &pool, None, with(vec![provider("p0")])).unwrap();
    let before = sign_in(&settings, None).providers[0].fingerprint();
    let mut moved = provider("p0");
    moved.client_id = "other".to_string();
    set_sign_in(&settings, &pool, None, with(vec![moved])).unwrap();

    mark_provider_tested(&settings, &pool, "p0", &before);

    assert_eq!(sign_in(&settings, None).live().count(), 0);
}

#[test]
fn passwords_cannot_be_turned_off_while_no_provider_is_live() {
    let pool = pool();
    let settings = Settings::load(&pool);
    let mut without = with(vec![provider("p0")]);
    without.password = false;

    let refused = set_sign_in(&settings, &pool, None, without.clone());
    assert_eq!(refused, Err(SignInRefused::PasswordNeedsProvider));
    assert!(sign_in(&settings, None).password);

    set_sign_in(&settings, &pool, None, with(vec![provider("p0")])).unwrap();
    tested(&settings, &pool, "p0");

    assert_eq!(set_sign_in(&settings, &pool, None, without), Ok(()));
    assert!(!sign_in(&settings, None).password);
}

#[test]
fn two_providers_under_one_id_are_refused() {
    let pool = pool();
    let settings = Settings::load(&pool);

    let refused = set_sign_in(
        &settings,
        &pool,
        None,
        with(vec![provider("p0"), provider("p0")]),
    );

    assert_eq!(refused, Err(SignInRefused::DuplicateProvider));
}

#[test]
fn the_environments_provider_comes_first_and_is_live_without_a_test() {
    let pool = pool();
    let settings = Settings::load(&pool);
    set_sign_in(&settings, &pool, None, with(vec![provider("p0")])).unwrap();

    let config = sign_in(&settings, Some(&env()));

    assert_eq!(config.providers[0].id, ENV_PROVIDER_ID);
    assert_eq!(config.providers[0].issuer, "https://env.test");
    assert!(config.providers[0].is_live());
    assert_eq!(config.providers[1].id, "p0");
}

#[test]
fn the_environments_provider_keeps_its_policy_and_never_stores_its_connection() {
    let pool = pool();
    let settings = Settings::load(&pool);
    let mut policy = provider(ENV_PROVIDER_ID);
    policy.issuer = "https://typed-over.test".to_string();
    policy.new_people = NewPeople::Invite;

    set_sign_in(&settings, &pool, Some(&env()), with(vec![policy])).unwrap();

    let stored = settings.get(SIGN_IN_KEY).to_string();
    assert!(!stored.contains("env-secret"));
    assert!(!stored.contains("typed-over"));
    let read = sign_in(&settings, Some(&env()));
    assert_eq!(read.providers[0].issuer, "https://env.test");
    assert_eq!(read.providers[0].new_people, NewPeople::Invite);
}

#[test]
fn a_policy_left_behind_by_the_environment_is_not_a_provider() {
    let pool = pool();
    let settings = Settings::load(&pool);
    set_sign_in(
        &settings,
        &pool,
        Some(&env()),
        with(vec![provider(ENV_PROVIDER_ID)]),
    )
    .unwrap();

    let without_env = sign_in(&settings, None);

    assert!(without_env.providers.is_empty());
}

#[test]
fn groups_are_asked_for_only_from_a_provider_that_has_them() {
    let mut p = provider("p0");
    p.scopes = vec!["offline".to_string(), " email ".to_string(), String::new()];

    assert_eq!(p.scope(&[]), "openid profile email offline");
    assert_eq!(
        p.scope(&["openid".to_string(), "groups".to_string()]),
        "openid profile email groups offline"
    );
}

#[test]
fn a_stored_blob_that_no_longer_parses_reads_as_the_defaults() {
    let pool = pool();
    let settings = Settings::load(&pool);
    settings.set_patch(
        &pool,
        BTreeMap::from([(SIGN_IN_KEY.to_string(), json!("nonsense"))]),
    );

    assert_eq!(sign_in(&settings, None), SignIn::default());
}
