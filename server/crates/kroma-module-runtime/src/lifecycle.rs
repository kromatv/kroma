use kroma_module_host::ServerModule;
use kroma_module_wire::Lifecycle;

use crate::events::wanted_topics;
use crate::jobs::collect_jobs;
use crate::migrations::declared_migrations;
use crate::remote_host::RemoteHost;

pub(crate) fn declared(modules: &[Box<dyn ServerModule<RemoteHost>>]) -> anyhow::Result<Lifecycle> {
    Ok(Lifecycle {
        migrations: declared_migrations(modules)?,
        jobs: collect_jobs(modules).1,
        events: wanted_topics(modules),
    })
}
