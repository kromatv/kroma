use super::Permissions;

impl Permissions {
    /// The first problem in the block, worded for a module author, or `None`.
    pub fn problem(&self) -> Option<String> {
        let net = &self.net;
        for entry in &net.connect {
            if !is_purpose(&entry.purpose) {
                return Some(format!(
                    "net.connect: \"{}\" is not a purpose name (a-z, 0-9, -)",
                    entry.purpose
                ));
            }
            if entry.to.is_empty() {
                return Some(format!(
                    "net.connect \"{}\": `to` names no destination",
                    entry.purpose
                ));
            }
            if let Some(bad) = entry.to.iter().find(|to| !is_destination(to)) {
                return Some(format!(
                    "net.connect \"{}\": \"{bad}\" is not a destination",
                    entry.purpose
                ));
            }
            if entry.ports.contains(&0) {
                return Some(format!(
                    "net.connect \"{}\": port 0 is not a port",
                    entry.purpose
                ));
            }
        }
        for entry in &net.listen {
            if !is_purpose(&entry.purpose) {
                return Some(format!(
                    "net.listen: \"{}\" is not a purpose name",
                    entry.purpose
                ));
            }
            let port_ok = match &entry.port {
                serde_json::Value::Number(n) => {
                    n.as_u64().is_some_and(|p| (1..=65535).contains(&p))
                }
                serde_json::Value::String(s) => {
                    s.strip_prefix("setting:").is_some_and(is_setting_key)
                }
                _ => false,
            };
            if !port_ok {
                return Some(format!(
                    "net.listen \"{}\": port must be 1-65535 or setting:<key>",
                    entry.purpose
                ));
            }
        }
        if let Some(bad) = self.run.iter().find(|bin| !is_binary_name(bin)) {
            return Some(format!(
                "run: \"{bad}\" must be a bare binary name, not a path"
            ));
        }
        if let Some(bad) = self.env.iter().find(|name| !is_env_name(name)) {
            return Some(format!(
                "env: \"{bad}\" is not an environment variable name"
            ));
        }
        None
    }
}

fn is_purpose(name: &str) -> bool {
    (1..=32).contains(&name.len())
        && name.starts_with(|c: char| c.is_ascii_lowercase())
        && name.chars().all(is_slug_char)
}

fn is_destination(to: &str) -> bool {
    if to == "public" || to == "lan" {
        return true;
    }
    if let Some(key) = to.strip_prefix("setting:") {
        return is_setting_key(key);
    }
    let host = to.strip_prefix("*.").unwrap_or(to);
    !host.is_empty()
        && host.len() <= 253
        && host.contains('.')
        && host
            .split('.')
            .all(|label| !label.is_empty() && label.chars().all(is_slug_char))
}

fn is_slug_char(c: char) -> bool {
    c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'
}

fn is_setting_key(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
}

fn is_binary_name(bin: &str) -> bool {
    !bin.is_empty() && !bin.contains('/') && bin != "." && bin != ".."
}

fn is_env_name(name: &str) -> bool {
    !name.is_empty()
        && name.starts_with(|c: char| c.is_ascii_uppercase() || c == '_')
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}
