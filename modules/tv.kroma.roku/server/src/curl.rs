//! The HTTP calls a Roku answers: plain ECP requests on :8060 and the
//! developer installer's digest-authenticated multipart upload on :80. Every
//! option travels to curl on stdin, so the developer password never sits in
//! argv where `ps` reads it.

use std::io::Write;
use std::process::{Command, Stdio};

use anyhow::{bail, Context, Result};

pub struct Reply {
    pub status: u16,
    pub body: String,
}

pub struct CurlConfig(String);

impl CurlConfig {
    pub fn new(url: &str, max_time_secs: u32) -> Self {
        let mut config = String::from("silent\nshow-error\n");
        config.push_str(&option("max-time", &max_time_secs.to_string()));
        config.push_str("write-out = \"\\n%{http_code}\"\n");
        config.push_str(&option("url", url));
        Self(config)
    }

    pub fn post_empty(mut self) -> Self {
        self.0.push_str("request = \"POST\"\n");
        self.0.push_str("data = \"\"\n");
        self
    }

    pub fn digest(mut self, user: &str, password: &str) -> Self {
        self.0.push_str("digest\n");
        self.0
            .push_str(&option("user", &format!("{user}:{password}")));
        self
    }

    pub fn form(mut self, field: &str, value: &str) -> Self {
        self.0
            .push_str(&option("form", &format!("{field}={value}")));
        self
    }

    #[cfg(test)]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn run(self) -> Result<Reply> {
        let mut child = Command::new("curl")
            .arg("--config")
            .arg("-")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("spawn curl")?;
        let mut stdin = child.stdin.take().context("curl stdin was not piped")?;
        let written = stdin.write_all(self.0.as_bytes());
        drop(stdin);
        let out = child.wait_with_output().context("wait for curl")?;
        if !out.status.success() {
            bail!(
                "curl exit {}: {}",
                out.status.code().unwrap_or(-1),
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
        written.context("write the curl config")?;
        split_status(&String::from_utf8_lossy(&out.stdout))
    }
}

fn option(name: &str, value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    let escaped = escaped.replace(['\n', '\r'], "");
    format!("{name} = \"{escaped}\"\n")
}

fn split_status(stdout: &str) -> Result<Reply> {
    let (body, code) = stdout
        .rsplit_once('\n')
        .context("curl printed no status code")?;
    let status = code.trim().parse().context("curl status code")?;
    Ok(Reply {
        status,
        body: body.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_status_code_is_read_off_the_last_line_and_the_body_kept_intact() {
        let reply = split_status("<html>\nInstall Success\n</html>\n200").unwrap();

        assert_eq!(reply.status, 200);
        assert_eq!(reply.body, "<html>\nInstall Success\n</html>");
    }

    #[test]
    fn an_empty_body_still_yields_its_status() {
        let reply = split_status("\n401").unwrap();

        assert_eq!(reply.status, 401);
        assert_eq!(reply.body, "");
    }

    #[test]
    fn a_password_cannot_smuggle_a_second_curl_option() {
        let config = CurlConfig::new("http://10.0.0.5/plugin_install", 90)
            .digest("rokudev", "pa\"ss\nurl = \"http://evil\"")
            .form("mysubmit", "Replace");

        let text = config.as_str();
        assert!(
            text.contains(r#"user = "rokudev:pa\"ssurl = \"http://evil\"""#),
            "{text}"
        );
        assert_eq!(text.matches("\nurl = ").count(), 1, "{text}");
        assert!(text.contains("\ndigest\n"));
        assert!(text.contains(r#"form = "mysubmit=Replace""#));
    }

    #[test]
    fn an_ecp_command_is_a_post_with_an_empty_body() {
        let text = CurlConfig::new("http://10.0.0.5:8060/keypress/Home", 5)
            .post_empty()
            .as_str()
            .to_string();

        assert!(text.contains("request = \"POST\""), "{text}");
        assert!(text.contains("data = \"\""), "{text}");
        assert!(text.contains("max-time = \"5\""), "{text}");
    }
}
