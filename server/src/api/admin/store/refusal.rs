use kroma_module_manifest::EngineRefusal;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Refusal {
    #[serde(rename_all = "camelCase")]
    Schema {
        built: u64,
        speaks: u64,
    },
    UnknownEngine {
        engine: String,
    },
    #[serde(rename_all = "camelCase")]
    Engine {
        engine: String,
        range: String,
        server_version: String,
    },
    Interface {
        built: String,
        implements: String,
    },
    CoreSchema {
        needs: String,
        has: u32,
    },
    CoreTable {
        table: String,
        built: u32,
        changed: u32,
    },
    Native,
}

impl From<EngineRefusal> for Refusal {
    fn from(refusal: EngineRefusal) -> Self {
        match refusal {
            EngineRefusal::Unknown { engine } => Self::UnknownEngine { engine },
            EngineRefusal::Unsatisfied {
                engine,
                range,
                server_version,
            } => Self::Engine {
                engine,
                range,
                server_version,
            },
            EngineRefusal::Interface { built, implements } => Self::Interface { built, implements },
            EngineRefusal::CoreSchema { needs, has } => Self::CoreSchema { needs, has },
            EngineRefusal::CoreTable {
                table,
                built,
                changed,
            } => Self::CoreTable {
                table,
                built,
                changed,
            },
        }
    }
}

impl Refusal {
    pub fn reason(&self) -> String {
        match self {
            Self::Schema { built, speaks } => format!(
                "built for manifest schema v{built} (this server speaks v{speaks}); it needs rebuilding"
            ),
            Self::UnknownEngine { engine } => EngineRefusal::Unknown {
                engine: engine.clone(),
            }
            .to_string(),
            Self::Engine {
                engine,
                range,
                server_version,
            } => EngineRefusal::Unsatisfied {
                engine: engine.clone(),
                range: range.clone(),
                server_version: server_version.clone(),
            }
            .to_string(),
            Self::Interface { built, implements } => EngineRefusal::Interface {
                built: built.clone(),
                implements: implements.clone(),
            }
            .to_string(),
            Self::CoreSchema { needs, has } => EngineRefusal::CoreSchema {
                needs: needs.clone(),
                has: *has,
            }
            .to_string(),
            Self::CoreTable {
                table,
                built,
                changed,
            } => EngineRefusal::CoreTable {
                table: table.clone(),
                built: *built,
                changed: *changed,
            }
            .to_string(),
            Self::Native => "a native build, which this server no longer runs".to_string(),
        }
    }
}
