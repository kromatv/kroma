use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use kroma_module_host::{ServerModule, async_trait};
use kroma_module_wire::{JobSpec, Role};

use crate::RemoteHost;
use crate::env::Startup;
use crate::lifecycle::declared;

struct Counted(Arc<AtomicUsize>);

#[async_trait]
impl ServerModule<RemoteHost> for Counted {
    fn id(&self) -> &'static str {
        "tv.kroma.counted"
    }

    async fn on_enable(&self, _host: RemoteHost) {
        self.0.fetch_add(1, Ordering::SeqCst);
    }
}

fn enabled_as(startup: Startup) -> usize {
    let dir = super::scratch("roles");
    let mut env = super::env(
        dir.path(),
        "tv.kroma.counted",
        &dir.path().join("no-core.sock"),
    );
    env.startup = startup;
    let enabled = Arc::new(AtomicUsize::new(0));
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");

    rt.block_on(crate::serve::started(
        env,
        |_| axum::Router::new(),
        vec![Box::new(Counted(enabled.clone()))],
    ))
    .map(|_| ())
    .expect("started");

    enabled.load(Ordering::SeqCst)
}

#[test]
fn a_worker_never_enables_the_module() {
    assert_eq!(enabled_as(Startup::Run(Role::Worker)), 0);
}

#[test]
fn the_primary_enables_the_module() {
    assert_eq!(enabled_as(Startup::Run(Role::Primary)), 1);
}

#[test]
fn an_instance_given_no_role_runs_its_whole_startup_itself() {
    assert_eq!(Startup::of(None).unwrap(), Startup::Own);
}

#[test]
fn a_role_the_runtime_does_not_know_is_refused() {
    assert!(Startup::of(Some("leader")).is_err());
}

#[test]
fn the_lifecycle_names_every_job_and_topic_once() {
    let modules: Vec<Box<dyn ServerModule<RemoteHost>>> = vec![Box::new(super::Demo)];

    let lifecycle = declared(&modules).unwrap();

    assert_eq!(
        lifecycle.jobs.first(),
        Some(&JobSpec {
            key: "demo.ping".into(),
            category: "maintenance".into(),
            schedule: Some("0 * * * *".into()),
        })
    );
    assert_eq!(lifecycle.jobs.len(), 3);
    assert_eq!(lifecycle.events, ["demo.ping", "demo.other"]);
    assert_eq!(lifecycle.migrations, None);
}

#[cfg(not(feature = "storage"))]
#[test]
fn a_schema_is_not_declared_without_the_storage_capability() {
    let modules: Vec<Box<dyn ServerModule<RemoteHost>>> = vec![Box::new(super::NeedsSchema)];

    let refused = declared(&modules).unwrap_err();

    assert!(format!("{refused:#}").contains("without the storage capability"));
}

#[cfg(feature = "storage")]
struct Stepped(&'static [kroma_sqlite::Step]);

#[cfg(feature = "storage")]
#[async_trait]
impl ServerModule<RemoteHost> for Stepped {
    fn id(&self) -> &'static str {
        "tv.kroma.stepped"
    }

    fn migrations(&self) -> &'static str {
        "CREATE TABLE IF NOT EXISTS notes (id TEXT);"
    }

    fn steps(&self) -> &'static [kroma_sqlite::Step] {
        self.0
    }
}

#[cfg(feature = "storage")]
#[test]
fn a_schema_is_declared_as_the_sql_the_host_applies() {
    const STEPS: &[kroma_sqlite::Step] = &[kroma_sqlite::Step {
        name: "0002_pinned",
        run: kroma_sqlite::Run::Sql("ALTER TABLE notes ADD COLUMN pinned INTEGER"),
        rebuilds: true,
    }];
    let modules: Vec<Box<dyn ServerModule<RemoteHost>>> = vec![Box::new(Stepped(STEPS))];

    let migrations = declared(&modules).unwrap().migrations.unwrap();

    assert_eq!(
        migrations.baseline,
        "CREATE TABLE IF NOT EXISTS notes (id TEXT);"
    );
    assert_eq!(
        migrations.steps,
        [kroma_module_wire::MigrationStep {
            name: "0002_pinned".into(),
            sql: "ALTER TABLE notes ADD COLUMN pinned INTEGER".into(),
            rebuilds: true,
        }]
    );
}

#[cfg(feature = "storage")]
#[test]
fn a_step_that_runs_code_is_refused_by_name() {
    const STEPS: &[kroma_sqlite::Step] = &[kroma_sqlite::Step {
        name: "0002_by_hand",
        run: kroma_sqlite::Run::Code(|_| Ok(())),
        rebuilds: false,
    }];
    let modules: Vec<Box<dyn ServerModule<RemoteHost>>> = vec![Box::new(Stepped(STEPS))];

    let refused = declared(&modules).unwrap_err();

    assert!(
        format!("{refused:#}").contains("0002_by_hand"),
        "{refused:#}"
    );
}
