use kroma_module_host::ServerModule;

use crate::remote_host::RemoteHost;

// A module's `migrations()` run against its OWN database, never the shared one:
// the core database's schema is the core's, and a module that could add a table
// to it could add a trigger to one it cannot read.
#[cfg(feature = "storage")]
pub(crate) fn apply_module_migrations(
    host: &RemoteHost,
    modules: &[Box<dyn ServerModule<RemoteHost>>],
) -> anyhow::Result<()> {
    use kroma_module_host::HostStorage;
    let owners: Vec<_> = modules
        .iter()
        .filter(|module| !module.migrations().is_empty())
        .collect();
    anyhow::ensure!(
        owners.len() <= 1,
        "one process holds one module database, and {} modules declare a schema",
        owners.len()
    );
    for module in owners {
        kroma_sqlite::migrate_store(
            host.store(),
            module.id(),
            module.migrations(),
            module.steps(),
        )?;
    }
    Ok(())
}

#[cfg(not(feature = "storage"))]
pub(crate) fn apply_module_migrations(
    _host: &RemoteHost,
    modules: &[Box<dyn ServerModule<RemoteHost>>],
) -> anyhow::Result<()> {
    for module in modules {
        anyhow::ensure!(
            module.migrations().is_empty(),
            "'{}' declares migrations but was built without the storage capability; add \
             `storage` to its module.json and enable the SDK's `storage` feature",
            module.id(),
        );
    }
    Ok(())
}
