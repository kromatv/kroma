use kroma_module_wire::NotificationType;

/// What one installed module declares about its notifications: the types its
/// `module.json` lists, and the catalogs their keys name, as `(locale, json)`
/// pairs read from the `locales/` its bundle ships.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ModuleNotifications {
    pub module_id: String,
    pub types: Vec<NotificationType>,
    pub catalogs: Vec<(String, String)>,
}
