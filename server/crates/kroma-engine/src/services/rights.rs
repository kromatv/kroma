use serde_json::json;
use tracing::{info, warn};

use kroma_db::Pool;
use kroma_domain::Permission;

use super::settings::Settings;

pub const CARRIED_KEY: &str = "rightsCarried";

/// Direct play searches indexers and starts a download with nobody approving it,
/// which is `requests.auto` by another route, and whoever runs the server can
/// tick the right for themselves in one request anyway.
pub const AS_POWERFUL_AS_DIRECT_PLAY: [Permission; 4] = [
    Permission::RequestsAuto,
    Permission::UsersManage,
    Permission::LibraryManage,
    Permission::SettingsManage,
];

/// Grants `perm`, the first time this install is asked to, to the accounts
/// already holding one of `equivalent`. A grant that could not be written is
/// left unmarked for the next start to retry.
pub fn carry_to_equivalent_accounts(
    settings: &Settings,
    pool: &Pool,
    perm: Permission,
    equivalent: &[Permission],
) {
    let mut carried = carried(settings);
    if carried.iter().any(|done| done == perm.key()) {
        return;
    }
    let granted = match kroma_db::grant_to_accounts_holding(pool, perm, equivalent) {
        Ok(granted) => granted,
        Err(error) => {
            warn!(
                right = perm.key(),
                %error,
                "could not carry a newly gated right; the next start tries again"
            );
            return;
        }
    };
    carried.push(perm.key().to_string());
    if let Err(error) = settings.set_internal(pool, CARRIED_KEY, json!(carried)) {
        warn!(
            right = perm.key(),
            %error,
            "carried a newly gated right but could not mark it; the next start carries it again, \
             over anything the operator took back in between"
        );
        return;
    }
    info!(
        right = perm.key(),
        accounts = granted,
        "granted a newly gated right to the accounts already holding its equal"
    );
}

fn carried(settings: &Settings) -> Vec<String> {
    serde_json::from_value(settings.get(CARRIED_KEY)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn holds(pool: &Pool, id: &str, perm: Permission) -> bool {
        kroma_db::get_user(pool, id)
            .unwrap()
            .expect("the account")
            .can(perm)
    }

    fn account(pool: &Pool, email: &str, perms: &[Permission]) -> String {
        kroma_db::create_user(pool, email, email, "hash", perms)
            .unwrap()
            .id
    }

    fn carry(settings: &Settings, pool: &Pool) {
        carry_to_equivalent_accounts(
            settings,
            pool,
            Permission::WatchablePlay,
            &AS_POWERFUL_AS_DIRECT_PLAY,
        );
    }

    #[test]
    fn an_account_that_could_already_download_without_asking_holds_it_after_the_upgrade() {
        let pool = kroma_db::testing::temp_pool("rights-carry");
        let settings = Settings::load(&pool);
        let ana = account(
            &pool,
            "a@b.c",
            &[Permission::Playback, Permission::RequestsAuto],
        );

        carry(&settings, &pool);

        assert!(holds(&pool, &ana, Permission::WatchablePlay));
    }

    #[test]
    fn a_member_who_could_only_watch_is_not_handed_it() {
        let pool = kroma_db::testing::temp_pool("rights-member");
        let settings = Settings::load(&pool);
        let ed = account(&pool, "e@b.c", &[Permission::Playback]);

        carry(&settings, &pool);

        assert!(!holds(&pool, &ed, Permission::WatchablePlay));
    }

    #[test]
    fn whoever_runs_the_server_holds_it_after_the_upgrade() {
        let pool = kroma_db::testing::temp_pool("rights-admins");
        let settings = Settings::load(&pool);
        let owner = account(
            &pool,
            "o@b.c",
            &[Permission::UsersManage, Permission::SettingsManage],
        );
        let librarian = account(&pool, "l@b.c", &[Permission::LibraryManage]);

        carry(&settings, &pool);

        assert!(holds(&pool, &owner, Permission::WatchablePlay));
        assert!(holds(&pool, &librarian, Permission::WatchablePlay));
    }

    #[test]
    fn a_right_the_operator_took_back_is_not_granted_again() {
        let pool = kroma_db::testing::temp_pool("rights-revoked");
        let settings = Settings::load(&pool);
        let ana = account(&pool, "a@b.c", &[Permission::RequestsAuto]);
        carry(&settings, &pool);
        kroma_db::update_user_permissions(&pool, &ana, &[Permission::RequestsAuto]).unwrap();

        carry(&settings, &pool);

        assert!(!holds(&pool, &ana, Permission::WatchablePlay));
    }

    #[test]
    fn a_restart_reads_the_mark_back_rather_than_granting_again() {
        let pool = kroma_db::testing::temp_pool("rights-restart");
        let settings = Settings::load(&pool);
        let ana = account(&pool, "a@b.c", &[Permission::RequestsAuto]);
        carry(&settings, &pool);
        kroma_db::update_user_permissions(&pool, &ana, &[Permission::RequestsAuto]).unwrap();

        carry(&Settings::load(&pool), &pool);

        assert!(!holds(&pool, &ana, Permission::WatchablePlay));
    }

    #[test]
    fn a_carry_that_could_not_be_written_is_left_for_the_next_start() {
        let pool = kroma_db::testing::temp_pool("rights-unwritable");
        let settings = Settings::load(&pool);
        account(&pool, "a@b.c", &[Permission::RequestsAuto]);
        pool.get()
            .unwrap()
            .execute("ALTER TABLE users RENAME TO users_away", [])
            .unwrap();

        carry(&settings, &pool);

        assert!(carried(&Settings::load(&pool)).is_empty());
    }
}
