//! What an audit found, and how it reads.

use std::collections::BTreeSet;
use std::fmt::Write as _;

use kroma_module_manifest::Permissions;
use kroma_module_supervisor::Asked;
use serde::Serialize;

use crate::drive::Call;
use crate::recorder::Connection;

/// A program the module asked the host to start.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct Program {
    pub name: String,
    pub declared: bool,
}

/// A file the module asked for through the host's own file calls. One inside a
/// folder it holds is `held`. Plain file access inside those folders is not
/// listed: a module cannot open a path outside them at all.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct File {
    pub path: String,
    pub writing: bool,
    pub held: bool,
}

/// Everything one module attempted while it was driven, beside what its
/// manifest declares.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub id: String,
    pub version: String,
    pub declared: Option<Permissions>,
    pub connections: Vec<Connection>,
    pub programs: Vec<Program>,
    pub files: Vec<File>,
    pub calls: Vec<Call>,
}

impl Report {
    pub(crate) fn of_asked(asked: Vec<Asked>) -> (Vec<Program>, Vec<File>) {
        let mut programs = BTreeSet::new();
        let mut files = BTreeSet::new();
        for one in asked {
            match one {
                Asked::Program { name, granted } => {
                    programs.insert(Program {
                        name,
                        declared: granted,
                    });
                }
                Asked::File {
                    path,
                    writing,
                    granted,
                } => {
                    files.insert(File {
                        path,
                        writing,
                        held: granted,
                    });
                }
            }
        }
        (programs.into_iter().collect(), files.into_iter().collect())
    }

    /// How many attempts fall outside what the module declares.
    pub fn undeclared(&self) -> usize {
        self.connections.iter().filter(|c| !c.declared).count()
            + self.programs.iter().filter(|p| !p.declared).count()
            + self.files.iter().filter(|f| !f.held).count()
    }

    /// The report as a person reads it: what is declared, then every attempt
    /// with `ok` or `NOT DECLARED` in front of it.
    pub fn render(&self) -> String {
        let mut out = format!("{} {}\n", self.id, self.version);
        self.render_declared(&mut out);
        section(&mut out, "Connections attempted", &self.connections, |c| {
            (c.declared, format!("{}  {}:{}", c.purpose, c.host, c.port))
        });
        section(&mut out, "Programs asked for", &self.programs, |p| {
            (p.declared, p.name.clone())
        });
        section(&mut out, "Files asked of the host", &self.files, |f| {
            let how = if f.writing { "write" } else { "read" };
            (f.held, format!("{how}  {}", f.path))
        });
        let _ = writeln!(out, "\nDriven");
        for call in &self.calls {
            let _ = writeln!(out, "  {:>3}  {} {}", call.answered(), call.method, call.path);
        }
        let outside = self.undeclared();
        let _ = match outside {
            0 => writeln!(out, "\nNothing outside the declaration."),
            1 => writeln!(out, "\n1 attempt outside the declaration."),
            n => writeln!(out, "\n{n} attempts outside the declaration."),
        };
        out
    }

    fn render_declared(&self, out: &mut String) {
        let _ = writeln!(out, "\nDeclared");
        let Some(declared) = &self.declared else {
            let _ = writeln!(out, "  no permissions: no network, no program, its own folder only");
            return;
        };
        for connect in &declared.net.connect {
            let line = serde_json::to_string(connect).unwrap_or_default();
            let _ = writeln!(out, "  net.connect  {line}");
        }
        if !declared.run.is_empty() {
            let _ = writeln!(out, "  run          {}", declared.run.join(", "));
        }
        for (kind, roots) in [("fs.read", &declared.fs.read), ("fs.write", &declared.fs.write)] {
            if !roots.is_empty() {
                let line = serde_json::to_string(roots).unwrap_or_default();
                let _ = writeln!(out, "  {kind:<11}  {line}");
            }
        }
    }
}

fn section<T>(out: &mut String, title: &str, rows: &[T], line: impl Fn(&T) -> (bool, String)) {
    let _ = writeln!(out, "\n{title}");
    if rows.is_empty() {
        let _ = writeln!(out, "  none");
    }
    for row in rows {
        let (declared, text) = line(row);
        let verdict = if declared { "ok          " } else { "NOT DECLARED" };
        let _ = writeln!(out, "  {verdict}  {text}");
    }
}
