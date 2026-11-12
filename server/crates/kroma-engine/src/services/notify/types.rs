//! Every kind of notification a reader can be told about: the core's events,
//! and the types installed modules declare with the catalogs their words are in.

use std::borrow::Cow;
use std::sync::{Arc, Mutex};

use kroma_db::notifications::TypeDefault;
use kroma_domain::{NotificationCategory, NotificationEvent, NotificationSpec, NotificationType};
use kroma_i18n::I18n;
use kroma_module_host::{HostCtx, ModuleNotifications};

use crate::i18n;

/// The core's events and every declared module type, with each declaring
/// module's catalogs built once. The default knows the core alone.
#[derive(Default)]
pub struct NotificationTypes {
    modules: Vec<DeclaringModule>,
}

struct DeclaringModule {
    id: String,
    types: Vec<NotificationType>,
    catalogs: Option<I18n>,
}

/// One kind of notification as a reader's settings list it.
pub struct Listed<'a> {
    pub name: &'a str,
    pub category: NotificationCategory,
    pub pushes: bool,
    pub label_key: String,
    pub module: Option<&'a str>,
}

/// The catalogs a row's keys resolve against: its module's first, when a
/// module raised it, then the core's.
pub struct Wording<'a>(Option<&'a I18n>);

impl Wording<'_> {
    pub fn t(&self, locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
        match self.0 {
            Some(module) if declares(module, key) => module.t(locale, key, vars),
            _ => i18n::t(locale, key, vars),
        }
    }

    /// Whether either catalog holds `key`.
    pub fn knows(&self, key: &str) -> bool {
        self.0.is_some_and(|module| declares(module, key)) || i18n::is_message_key(key)
    }
}

fn declares(catalogs: &I18n, key: &str) -> bool {
    catalogs.is_message_key(key) || catalogs.is_message_key(&format!("{key}_other"))
}

impl NotificationTypes {
    pub fn from_modules(declared: &[ModuleNotifications]) -> Self {
        Self {
            modules: declared
                .iter()
                .map(|module| DeclaringModule {
                    id: module.module_id.clone(),
                    types: module.types.clone(),
                    catalogs: catalogs_of(module),
                })
                .collect(),
        }
    }

    pub fn declared(&self, name: &str) -> Option<&NotificationType> {
        self.modules
            .iter()
            .flat_map(|module| &module.types)
            .find(|declared| declared.name == name)
    }

    /// The catalogs a row raised as `module_type` reads from.
    pub fn wording(&self, module_type: Option<&str>) -> Wording<'_> {
        let module = module_type
            .and_then(|name| name.split_once('/'))
            .map(|(module, _)| module);
        self.wording_of(module)
    }

    fn wording_of(&self, module: Option<&str>) -> Wording<'_> {
        Wording(module.and_then(|id| {
            self.modules
                .iter()
                .find(|m| m.id == id)
                .and_then(|m| m.catalogs.as_ref())
        }))
    }

    /// `spec` with what its declaration says filled in, or `None` for a type no
    /// installed module declares. A spec that names no type is itself.
    pub fn complete<'s>(&self, spec: &'s NotificationSpec) -> Option<Cow<'s, NotificationSpec>> {
        let Some(name) = spec.module_type.as_deref() else {
            return Some(Cow::Borrowed(spec));
        };
        let declared = self.declared(name)?;
        let mut completed = spec.clone().in_category(declared.category);
        completed.title_key = declared.title_key.clone();
        completed.body_key = declared.body_key.clone();
        Some(Cow::Owned(completed))
    }

    /// The type a reader's per-type choice is looked up under, `None` for a
    /// notification that has none and so follows its category alone.
    pub fn kind_of<'s>(&'s self, spec: &'s NotificationSpec) -> Option<TypeDefault<'s>> {
        if let Some(name) = spec.module_type.as_deref() {
            let declared = self.declared(name)?;
            return Some(TypeDefault {
                name: &declared.name,
                pushes: declared.push,
            });
        }
        is_listed(spec.event).then(|| TypeDefault {
            name: spec.event.as_str(),
            pushes: true,
        })
    }

    /// Every kind a reader can choose for: the core's events, then the types of
    /// each module `enabled` answers for.
    pub fn listed(&self, enabled: impl Fn(&str) -> bool) -> Vec<Listed<'_>> {
        let core = NotificationEvent::ALL
            .into_iter()
            .filter(|event| is_listed(*event))
            .map(|event| Listed {
                name: event.as_str(),
                category: event.category(),
                pushes: true,
                label_key: format!("notifications.{}.title", event.as_str()),
                module: None,
            });
        let declared = self
            .modules
            .iter()
            .filter(|module| enabled(&module.id))
            .flat_map(|module| {
                module.types.iter().map(|declared| Listed {
                    name: &declared.name,
                    category: declared.category,
                    pushes: declared.push,
                    label_key: declared.label().to_string(),
                    module: Some(&module.id),
                })
            });
        core.chain(declared).collect()
    }

    /// What `listed` calls the kind, in `locale`.
    pub fn label(&self, listed: &Listed<'_>, locale: &str) -> String {
        self.wording_of(listed.module)
            .t(locale, &listed.label_key, &[])
    }
}

fn is_listed(event: NotificationEvent) -> bool {
    !matches!(
        event,
        NotificationEvent::SystemTest | NotificationEvent::Custom
    )
}

const MODULE_FALLBACK_LOCALE: &str = "en";

fn catalogs_of(module: &ModuleNotifications) -> Option<I18n> {
    if module.catalogs.is_empty() {
        return None;
    }
    let catalogs: Vec<(&str, &str)> = module
        .catalogs
        .iter()
        .map(|(code, json)| (code.as_str(), json.as_str()))
        .collect();
    match kroma_i18n::from_catalogs(MODULE_FALLBACK_LOCALE, &catalogs) {
        Ok(built) => Some(built),
        Err(error) => {
            tracing::warn!(module = %module.module_id, %error, "a module's catalogs do not load; its notifications render from their keys");
            None
        }
    }
}

/// Where the declared types come from: registered as a host service over the
/// supervisor's listing, and rebuilt only when that listing changes.
pub struct DeclaredTypes {
    read: Box<dyn Fn() -> Listing + Send + Sync>,
    built: Mutex<Option<(Listing, Arc<NotificationTypes>)>>,
}

type Listing = Arc<Vec<ModuleNotifications>>;

impl DeclaredTypes {
    pub fn new(read: impl Fn() -> Listing + Send + Sync + 'static) -> Self {
        Self {
            read: Box::new(read),
            built: Mutex::new(None),
        }
    }

    pub fn current(&self) -> Arc<NotificationTypes> {
        let listing = (self.read)();
        let mut built = self.built.lock().unwrap();
        if let Some((seen, types)) = built.as_ref() {
            if Arc::ptr_eq(seen, &listing) {
                return types.clone();
            }
        }
        let types = Arc::new(NotificationTypes::from_modules(&listing));
        *built = Some((listing, types.clone()));
        types
    }
}

/// The kinds `host` can tell a reader about: the core's alone where no
/// [`DeclaredTypes`] is registered.
pub fn types_of(host: &dyn HostCtx) -> Arc<NotificationTypes> {
    kroma_module_host::service::<DeclaredTypes>(host)
        .map(|declared| declared.current())
        .unwrap_or_default()
}

#[cfg(test)]
pub(crate) mod test_support;

#[cfg(test)]
mod tests;
