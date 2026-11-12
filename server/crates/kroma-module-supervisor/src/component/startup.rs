use std::sync::atomic::Ordering;

use kroma_module_wire::{LIFECYCLE_HEADER, LIFECYCLE_PATH, Lifecycle, Migrations};
use kroma_sqlite::Migrated;
use kroma_wasm_host::{Header, ModuleInstance, NetPolicy, Request, Response};

use super::pool::Pool;

const MAX_LIFECYCLE_BYTES: usize = 4 * 1024 * 1024;

pub(super) fn lifecycle_of(answer: &Response) -> Result<Option<Lifecycle>, String> {
    let declared = answer
        .headers
        .iter()
        .any(|header| header.name.eq_ignore_ascii_case(LIFECYCLE_HEADER));
    if !declared {
        return Ok(None);
    }
    if answer.status != 200 {
        return Err(String::from_utf8_lossy(&answer.body).into_owned());
    }
    if answer.body.len() > MAX_LIFECYCLE_BYTES {
        return Err(format!(
            "its lifecycle is larger than {MAX_LIFECYCLE_BYTES} bytes"
        ));
    }
    serde_json::from_slice(&answer.body)
        .map(Some)
        .map_err(|error| format!("its lifecycle could not be read: {error}"))
}

fn json_post(path: &str, body: &serde_json::Value) -> Request {
    Request {
        method: "POST".to_string(),
        path: path.to_string(),
        headers: vec![Header {
            name: "content-type".to_string(),
            value: "application/json".to_string(),
        }],
        body: body.to_string().into_bytes(),
    }
}

impl Pool {
    pub(super) fn start_up(&self, primary: &mut ModuleInstance) -> Result<(), String> {
        let Some(lifecycle) = self.declared_by(primary)? else {
            (self.say)(
                "INFO this module runs its own startup in every instance, so it runs one until it is rebuilt",
            );
            return Ok(());
        };
        self.migrate(lifecycle.migrations.as_ref())?;
        self.register(&lifecycle);
        self.widen();
        Ok(())
    }

    fn declared_by(&self, primary: &mut ModuleInstance) -> Result<Option<Lifecycle>, String> {
        let asked = Request {
            method: "GET".to_string(),
            path: LIFECYCLE_PATH.to_string(),
            headers: vec![Header {
                name: "authorization".to_string(),
                value: format!("Bearer {}", self.port_token),
            }],
            body: Vec::new(),
        };
        let answer = primary.handle(&asked).map_err(|error| error.to_string())?;
        lifecycle_of(&answer)
    }

    fn migrate(&self, migrations: Option<&Migrations>) -> Result<(), String> {
        let Some(migrations) = migrations else {
            return Ok(());
        };
        let databases = self
            .databases
            .as_ref()
            .ok_or("it declares a schema, and its manifest declares no storage")?;
        let migrated = databases
            .migrate_own(migrations)
            .map_err(|error| format!("{error:#}"))?;
        match migrated {
            Migrated::Current => {}
            Migrated::Created => (self.say)("INFO its database was created"),
            Migrated::Upgraded { from, to } => {
                (self.say)(&format!(
                    "INFO its database moved from schema {from} to {to}"
                ));
            }
        }
        Ok(())
    }

    fn register(&self, lifecycle: &Lifecycle) {
        for job in &lifecycle.jobs {
            self.tell_the_core(
                "register-job",
                &serde_json::json!({
                    "moduleId": self.module,
                    "key": job.key,
                    "category": job.category,
                    "schedule": job.schedule,
                }),
            );
        }
        if !lifecycle.events.is_empty() {
            self.tell_the_core(
                "register-events",
                &serde_json::json!({ "moduleId": self.module, "topics": lifecycle.events }),
            );
        }
    }

    fn tell_the_core(&self, callback: &str, body: &serde_json::Value) {
        let path = format!("/api/_host/{callback}");
        match self.outside.host_api(&json_post(&path, body)) {
            Ok(answer) if (200..300).contains(&answer.status) => {}
            Ok(answer) => (self.say)(&format!(
                "WARN the core refused {callback}: {} {}",
                answer.status,
                String::from_utf8_lossy(&answer.body)
            )),
            Err(reason) => (self.say)(&format!("WARN {callback} did not reach the core: {reason}")),
        }
    }

    fn widen(&self) {
        self.capacity.store(self.instances, Ordering::Release);
        self.slots
            .add_permits(self.instances.saturating_sub(1) as usize);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answer(status: u16, headers: &[&str], body: &str) -> Response {
        Response {
            status,
            headers: headers
                .iter()
                .map(|name| Header {
                    name: (*name).to_string(),
                    value: "1".to_string(),
                })
                .collect(),
            body: body.as_bytes().to_vec(),
        }
    }

    #[test]
    fn a_module_built_before_the_host_ran_its_lifecycle_declares_none() {
        let not_found = answer(404, &[], "");

        assert_eq!(lifecycle_of(&not_found), Ok(None));
    }

    #[test]
    fn a_declared_lifecycle_is_read() {
        let declared = answer(200, &[LIFECYCLE_HEADER], r#"{"events":["item.updated"]}"#);

        let lifecycle = lifecycle_of(&declared).unwrap().unwrap();

        assert_eq!(lifecycle.events, ["item.updated"]);
    }

    #[test]
    fn a_module_that_cannot_declare_its_lifecycle_says_why() {
        let refused = answer(500, &[LIFECYCLE_HEADER], "step 2 runs code");

        assert_eq!(lifecycle_of(&refused), Err("step 2 runs code".to_string()));
    }
}
