use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{bail, Result};
use serde::Deserialize;

const BUILT_IN: &str = include_str!("../../clients.json");
const MAX_CLIENTS: usize = 8;
const MAX_FIELD: usize = 256;
const MAX_CONTEXT: usize = 16;
const REFRESH_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
const RETRY_AFTER: Duration = Duration::from_secs(10 * 60);

pub(crate) const REMOTE: &str =
    "https://raw.githubusercontent.com/kromatv/kroma/main/modules/tv.kroma.trailers/clients.json";

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Client {
    pub(crate) name: String,
    pub(crate) client_name: String,
    pub(crate) client_name_id: u32,
    pub(crate) client_version: String,
    pub(crate) user_agent: String,
    #[serde(default)]
    pub(crate) context: BTreeMap<String, String>,
}

#[derive(Deserialize)]
struct ProfileFile {
    clients: Vec<Client>,
}

pub(crate) fn parse(text: &str) -> Result<Vec<Client>> {
    let file: ProfileFile = serde_json::from_str(text)?;
    if file.clients.is_empty() || file.clients.len() > MAX_CLIENTS {
        bail!("a profile file names between 1 and {MAX_CLIENTS} clients");
    }
    for client in &file.clients {
        let fields = [
            &client.name,
            &client.client_name,
            &client.client_version,
            &client.user_agent,
        ];
        let context = client.context.iter().flat_map(|(k, v)| [k, v]);
        if client.context.len() > MAX_CONTEXT
            || fields
                .into_iter()
                .chain(context)
                .any(|field| !is_plain(field))
        {
            bail!(
                "the client {:?} holds a field this module does not send",
                client.name
            );
        }
    }
    Ok(file.clients)
}

fn is_plain(field: &str) -> bool {
    !field.is_empty()
        && field.len() <= MAX_FIELD
        && field.chars().all(|c| c == ' ' || c.is_ascii_graphic())
}

struct State {
    clients: Vec<Client>,
    checked: Option<Instant>,
}

pub(crate) struct Profiles {
    state: Mutex<State>,
}

impl Profiles {
    pub(crate) fn built_in() -> Self {
        let clients = parse(BUILT_IN).unwrap_or_default();
        Self {
            state: Mutex::new(State {
                clients,
                checked: None,
            }),
        }
    }

    pub(crate) fn clients(&self, now: Instant, remote: impl Fn() -> Result<String>) -> Vec<Client> {
        let stale = self.lock(|state| {
            state
                .checked
                .is_none_or(|at| now.duration_since(at) >= REFRESH_EVERY)
        });
        if stale {
            self.refresh(now, &remote);
        }
        self.lock(|state| state.clients.clone())
    }

    pub(crate) fn refresh_after_failure(
        &self,
        now: Instant,
        remote: impl Fn() -> Result<String>,
    ) -> bool {
        let recent = self.lock(|state| {
            state
                .checked
                .is_some_and(|at| now.duration_since(at) < RETRY_AFTER)
        });
        !recent && self.refresh(now, &remote)
    }

    pub(crate) fn worked(&self, name: &str) {
        self.lock(|state| promote(&mut state.clients, name));
    }

    fn refresh(&self, now: Instant, remote: &impl Fn() -> Result<String>) -> bool {
        let fetched = remote().and_then(|text| parse(&text));
        self.lock(|state| {
            state.checked = Some(now);
            match fetched {
                Ok(clients) if clients != state.clients => {
                    let preferred = state.clients.first().map(|c| c.name.clone());
                    state.clients = clients;
                    if let Some(name) = preferred {
                        promote(&mut state.clients, &name);
                    }
                    true
                }
                Ok(_) => false,
                Err(error) => {
                    tracing::debug!("trailer client profiles stay as they were: {error:#}");
                    false
                }
            }
        })
    }

    fn lock<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        f(&mut state)
    }
}

fn promote(clients: &mut Vec<Client>, name: &str) {
    if let Some(index) = clients.iter().position(|c| c.name == name) {
        let client = clients.remove(index);
        clients.insert(0, client);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use anyhow::anyhow;

    fn profile(names: &[&str]) -> String {
        let clients: Vec<String> = names
            .iter()
            .map(|name| {
                format!(
                    r#"{{"name":"{name}","clientName":"X","clientNameId":1,"clientVersion":"1","userAgent":"UA"}}"#
                )
            })
            .collect();
        format!(r#"{{"clients":[{}]}}"#, clients.join(","))
    }

    fn names(clients: &[Client]) -> Vec<String> {
        clients.iter().map(|c| c.name.clone()).collect()
    }

    #[test]
    fn the_built_in_profiles_parse() {
        let clients = parse(BUILT_IN).unwrap();

        assert_eq!(names(&clients), vec!["visionos"]);
    }

    #[test]
    fn a_field_with_a_line_break_is_refused() {
        let text = profile(&["ok"]).replace("\"UA\"", "\"UA\\r\\nX-Evil: 1\"");

        let refused = parse(&text);

        assert!(refused.is_err());
    }

    #[test]
    fn the_remote_copy_replaces_the_built_in_one_on_first_use() {
        let profiles = Profiles::built_in();

        let clients = profiles.clients(Instant::now(), || Ok(profile(&["a", "b"])));

        assert_eq!(names(&clients), vec!["a", "b"]);
    }

    #[test]
    fn an_unreachable_remote_keeps_the_built_in_profiles() {
        let profiles = Profiles::built_in();

        let clients = profiles.clients(Instant::now(), || Err(anyhow!("offline")));

        assert_eq!(names(&clients), vec!["visionos"]);
    }

    #[test]
    fn the_client_that_worked_is_tried_first() {
        let profiles = Profiles::built_in();
        let now = Instant::now();
        profiles.clients(now, || Ok(profile(&["a", "b"])));

        profiles.worked("b");

        assert_eq!(
            names(&profiles.clients(now, || Ok(profile(&["a", "b"])))),
            vec!["b", "a"]
        );
    }

    #[test]
    fn a_failure_soon_after_a_refresh_does_not_fetch_again() {
        let profiles = Profiles::built_in();
        let now = Instant::now();
        profiles.clients(now, || Ok(profile(&["a"])));

        let changed =
            profiles.refresh_after_failure(now + Duration::from_secs(60), || Ok(profile(&["b"])));

        assert!(!changed);
    }

    #[test]
    fn a_failure_long_after_a_refresh_picks_up_new_profiles() {
        let profiles = Profiles::built_in();
        let now = Instant::now();
        profiles.clients(now, || Ok(profile(&["a"])));

        let changed = profiles.refresh_after_failure(now + RETRY_AFTER, || Ok(profile(&["b"])));

        assert!(changed);
    }
}
