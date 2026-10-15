use kroma_module_sdk::domain::{Permission, User};

pub struct Viewer {
    pub(crate) id: String,
    pub(crate) sees_every_download: bool,
}

impl Viewer {
    pub fn of(user: &User) -> Self {
        Self {
            id: user.id.clone(),
            sees_every_download: user.can(Permission::RequestsManage)
                || user.can(Permission::SettingsManage),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::watch::test_support::{member, watcher};

    #[test]
    fn a_member_sees_only_what_they_started_and_whoever_drives_the_queue_sees_it_all() {
        let operator = User {
            permissions: vec![Permission::WatchablePlay, Permission::SettingsManage],
            ..member()
        };
        let moderator = User {
            permissions: vec![Permission::WatchablePlay, Permission::RequestsManage],
            ..member()
        };

        let seeing = [watcher(), operator, moderator].map(|user| Viewer::of(&user));

        assert_eq!(
            seeing.map(|viewer| viewer.sees_every_download),
            [false, true, true]
        );
    }
}
