use kroma_module_host::ServerModule;
use kroma_module_wire::Migrations;

use crate::remote_host::RemoteHost;

type Module = Box<dyn ServerModule<RemoteHost>>;

// A module's `migrations()` run against its OWN database, never the shared one:
// the core database's schema is the core's, and a module that could add a table
// to it could add a trigger to one it cannot read.
#[cfg(feature = "storage")]
pub(crate) fn apply_module_migrations(host: &RemoteHost, modules: &[Module]) -> anyhow::Result<()> {
    use kroma_module_host::HostStorage;
    if let Some(module) = schema_owner(modules)? {
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
    modules: &[Module],
) -> anyhow::Result<()> {
    schema_owner(modules).map(|_| ())
}

#[cfg(feature = "storage")]
pub(crate) fn declared_migrations(modules: &[Module]) -> anyhow::Result<Option<Migrations>> {
    use kroma_module_wire::MigrationStep;
    use kroma_sqlite::Run;
    let Some(module) = schema_owner(modules)? else {
        return Ok(None);
    };
    let steps = module
        .steps()
        .iter()
        .map(|step| match step.run {
            Run::Sql(sql) => Ok(MigrationStep {
                name: step.name.to_string(),
                sql: sql.to_string(),
                rebuilds: step.rebuilds,
            }),
            Run::Code(_) => Err(anyhow::anyhow!(
                "'{}' step {} runs code, and the host applies SQL only: write it as SQL",
                module.id(),
                step.name
            )),
        })
        .collect::<anyhow::Result<_>>()?;
    Ok(Some(Migrations {
        baseline: module.migrations().to_string(),
        steps,
    }))
}

#[cfg(not(feature = "storage"))]
pub(crate) fn declared_migrations(modules: &[Module]) -> anyhow::Result<Option<Migrations>> {
    schema_owner(modules).map(|_| None)
}

#[cfg(feature = "storage")]
fn schema_owner(modules: &[Module]) -> anyhow::Result<Option<&Module>> {
    let mut owners = modules
        .iter()
        .filter(|module| !module.migrations().is_empty());
    let owner = owners.next();
    let others = owners.count();
    anyhow::ensure!(
        others == 0,
        "one module database holds one schema, and {} modules declare one",
        others + 1
    );
    Ok(owner)
}

#[cfg(not(feature = "storage"))]
fn schema_owner(modules: &[Module]) -> anyhow::Result<Option<&Module>> {
    for module in modules {
        anyhow::ensure!(
            module.migrations().is_empty(),
            "'{}' declares migrations but was built without the storage capability; add \
             `storage` to its module.json and enable the SDK's `storage` feature",
            module.id(),
        );
    }
    Ok(None)
}
